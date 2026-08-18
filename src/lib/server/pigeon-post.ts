/**
 * Pigeon Post — server queries
 *
 * Distance-delayed messaging between mutual followers. The shape of this module
 * follows two rules that are easy to break and expensive to lose:
 *
 *  1. Exact coordinates are used for distance and never leave the server. Every
 *     position in a response goes through fuzz_for_map first.
 *  2. Delivery is a query predicate (deliver_at <= now), not a job. There is no
 *     cron, no worker and nothing that sweeps returned pigeons.
 */

import { db } from './db';
// Imported from the module rather than the $lib barrel, which also re-exports
// Svelte components that have no business being pulled into a server bundle.
import { normalize_handle } from '$lib/handle';
import {
	available_at_for,
	delivery_schedule,
	flock_size_for,
	fuzz_for_map,
	haversine_km,
	is_valid_coords,
	plan_recall,
	plan_route,
	route_total_km,
	type Coords,
	type RouteLeg
} from '$lib/pigeon/flight';

// ==========================================
// Errors
// ==========================================

/**
 * A failure with an HTTP status and a JSON body, so routes can translate a
 * domain problem into a response without re-deriving it.
 */
export class PigeonError extends Error {
	status: number;
	body: Record<string, unknown>;

	constructor(status: number, code: string, body: Record<string, unknown> = {}) {
		super(code);
		this.name = 'PigeonError';
		this.status = status;
		this.body = { error: code, ...body };
	}
}

// ==========================================
// Timestamps
// ==========================================

/**
 * 'YYYY-MM-DD HH:MM:SS.mmm' in UTC, with no trailing Z so it sorts
 * lexicographically against SQLite's own datetime('now') output.
 *
 * Millisecond precision is required, not cosmetic: last_read_at is compared
 * against deliver_at, and truncating either to whole seconds makes a message
 * that arrives inside the same second permanently unread.
 */
export function now_sql_timestamp(): string {
	return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export function sql_timestamp_from_epoch(epoch_ms: number): string {
	return new Date(epoch_ms).toISOString().replace('T', ' ').replace('Z', '');
}

export function epoch_from_sql_timestamp(value: string): number {
	return new Date(`${value.replace(' ', 'T')}Z`).getTime();
}

// ==========================================
// Pair keys
// ==========================================

/** Sorted so (a,b) and (b,a) address the same row or conversation. */
export function sort_pair(user_a_id: string, user_b_id: string): [string, string] {
	return user_a_id < user_b_id ? [user_a_id, user_b_id] : [user_b_id, user_a_id];
}

export function build_direct_key(user_a_id: string, user_b_id: string): string {
	return sort_pair(user_a_id, user_b_id).join(':');
}

// ==========================================
// Home coordinates
// ==========================================

export async function get_home_coords(user_id: string): Promise<Coords | null> {
	const result = await db.execute({
		sql: 'SELECT home_lat, home_lng FROM user WHERE id = ? LIMIT 1',
		args: [user_id]
	});

	const row = result.rows[0];
	if (!row || row.home_lat === null || row.home_lng === null) return null;

	return { lat: Number(row.home_lat), lng: Number(row.home_lng) };
}

export async function get_home_coords_many(user_ids: string[]): Promise<Map<string, Coords>> {
	const found = new Map<string, Coords>();
	if (user_ids.length === 0) return found;

	const placeholders = user_ids.map(() => '?').join(', ');
	const result = await db.execute({
		sql: `SELECT id, home_lat, home_lng FROM user
		      WHERE id IN (${placeholders}) AND home_lat IS NOT NULL AND home_lng IS NOT NULL`,
		args: user_ids
	});

	for (const row of result.rows) {
		found.set(row.id as string, { lat: Number(row.home_lat), lng: Number(row.home_lng) });
	}

	return found;
}

/**
 * Save a home loft and drop every cached distance that involved this user.
 *
 * The two halves are one function on purpose. Saving coordinates without
 * invalidating distances leaves a user who moved with their old flight times
 * forever, with no error and no symptom other than wrong arrival estimates.
 */
export async function set_home_coords(
	user_id: string,
	coords: Coords,
	accuracy_m: number | null
): Promise<void> {
	if (!is_valid_coords(coords)) {
		throw new PigeonError(400, 'invalid_coords');
	}

	const now = now_sql_timestamp();

	await db.batch(
		[
			{
				sql: `UPDATE user SET home_lat = ?, home_lng = ?, home_accuracy_m = ?, home_set_at = ?
				      WHERE id = ?`,
				args: [coords.lat, coords.lng, accuracy_m, now, user_id]
			},
			{
				sql: 'DELETE FROM user_distance WHERE user_a_id = ? OR user_b_id = ?',
				args: [user_id, user_id]
			}
		],
		'write'
	);
}

export async function has_home_coords(user_id: string): Promise<boolean> {
	return (await get_home_coords(user_id)) !== null;
}

// ==========================================
// Cached pair distance
// ==========================================

/**
 * Distance between two users, computed once and reused.
 *
 * Note this cache does not save time — haversine is a handful of float
 * operations with no I/O, so reading the stored value costs more than
 * recomputing it. It exists for stability: a quoted distance stays the number
 * that was quoted, even if the constants or the maths change later.
 */
export async function get_pair_distance_km(user_a_id: string, user_b_id: string): Promise<number> {
	const [first_id, second_id] = sort_pair(user_a_id, user_b_id);

	const cached = await db.execute({
		sql: 'SELECT distance_km FROM user_distance WHERE user_a_id = ? AND user_b_id = ? LIMIT 1',
		args: [first_id, second_id]
	});

	if (cached.rows.length > 0) return Number(cached.rows[0].distance_km);

	const coords = await get_home_coords_many([first_id, second_id]);
	const first_coords = coords.get(first_id);
	const second_coords = coords.get(second_id);

	if (!first_coords || !second_coords) {
		throw new PigeonError(409, 'home_unset');
	}

	const distance_km = haversine_km(first_coords, second_coords);

	await db.execute({
		sql: `INSERT INTO user_distance (user_a_id, user_b_id, distance_km, computed_at)
		      VALUES (?, ?, ?, ?)
		      ON CONFLICT(user_a_id, user_b_id) DO NOTHING`,
		args: [first_id, second_id, distance_km, now_sql_timestamp()]
	});

	return distance_km;
}

/**
 * Distances from one user to many others in two round trips regardless of size:
 * one read for the cached rows, one batch for whatever was missing.
 */
export async function get_pair_distances_km(
	user_id: string,
	other_ids: string[]
): Promise<Map<string, number>> {
	const distances = new Map<string, number>();
	const wanted = other_ids.filter((other_id) => other_id !== user_id);
	if (wanted.length === 0) return distances;

	const placeholders = wanted.map(() => '?').join(', ');
	const cached = await db.execute({
		sql: `SELECT user_a_id, user_b_id, distance_km FROM user_distance
		      WHERE (user_a_id = ? AND user_b_id IN (${placeholders}))
		         OR (user_b_id = ? AND user_a_id IN (${placeholders}))`,
		args: [user_id, ...wanted, user_id, ...wanted]
	});

	for (const row of cached.rows) {
		const other_id =
			row.user_a_id === user_id ? (row.user_b_id as string) : (row.user_a_id as string);
		distances.set(other_id, Number(row.distance_km));
	}

	const missing = wanted.filter((other_id) => !distances.has(other_id));
	if (missing.length === 0) return distances;

	const coords = await get_home_coords_many([user_id, ...missing]);
	const own_coords = coords.get(user_id);
	if (!own_coords) throw new PigeonError(409, 'sender_home_unset');

	const now = now_sql_timestamp();
	const inserts = [];

	for (const other_id of missing) {
		const other_coords = coords.get(other_id);
		if (!other_coords) continue;

		const distance_km = haversine_km(own_coords, other_coords);
		distances.set(other_id, distance_km);

		const [first_id, second_id] = sort_pair(user_id, other_id);
		inserts.push({
			sql: `INSERT INTO user_distance (user_a_id, user_b_id, distance_km, computed_at)
			      VALUES (?, ?, ?, ?)
			      ON CONFLICT(user_a_id, user_b_id) DO NOTHING`,
			args: [first_id, second_id, distance_km, now]
		});
	}

	if (inserts.length > 0) await db.batch(inserts, 'write');

	return distances;
}

// ==========================================
// Friends (mutual follows)
// ==========================================

export type PigeonFriend = {
	id: string;
	name: string;
	handle: string;
	avatar: string;
	verified: boolean;
};

/**
 * Mutual followers only: A follows B AND B follows A.
 *
 * This is an INNER self-join on follow. Do not reach for
 * build_post_visibility_clause in post-visibility.ts — that one ORs the two
 * directions together, which answers a different question entirely.
 *
 * Users without a home loft are excluded: with no coordinates there is no
 * distance, so a pigeon cannot be addressed to them.
 */
export async function get_mutual_follows(
	user_id: string,
	options: { search?: string; limit?: number } = {}
): Promise<PigeonFriend[]> {
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
	const search = options.search?.trim().toLowerCase() ?? '';

	const search_clause = search ? 'AND (lower(u.name) LIKE ? OR lower(u.username) LIKE ?)' : '';
	const search_args = search ? [`%${search}%`, `%${search}%`] : [];

	const result = await db.execute({
		sql: `SELECT u.id, u.name, u.username, u.image, u.verified
		      FROM follow f_out
		      JOIN follow f_in
		        ON f_in.follower_id = f_out.following_id
		       AND f_in.following_id = f_out.follower_id
		      JOIN user u ON u.id = f_out.following_id
		      WHERE f_out.follower_id = ?
		        AND u.home_lat IS NOT NULL
		        ${search_clause}
		      ORDER BY u.name COLLATE NOCASE ASC
		      LIMIT ?`,
		args: [user_id, ...search_args, limit]
	});

	return result.rows.map((row) => ({
		id: row.id as string,
		name: (row.name as string) || 'Unknown',
		handle: normalize_handle(row.username) || 'user',
		avatar: (row.image as string) || '',
		verified: Boolean(row.verified)
	}));
}

export async function are_mutual_follows(user_a_id: string, user_b_id: string): Promise<boolean> {
	if (user_a_id === user_b_id) return false;

	const result = await db.execute({
		sql: `SELECT 1 FROM follow a
		      JOIN follow b ON b.follower_id = a.following_id AND b.following_id = a.follower_id
		      WHERE a.follower_id = ? AND a.following_id = ?
		      LIMIT 1`,
		args: [user_a_id, user_b_id]
	});

	return result.rows.length > 0;
}

/** Which of the candidates are mutual followers of user_id. Order is not preserved. */
export async function filter_mutual_follows(
	user_id: string,
	candidate_ids: string[]
): Promise<string[]> {
	const candidates = candidate_ids.filter((candidate_id) => candidate_id !== user_id);
	if (candidates.length === 0) return [];

	const placeholders = candidates.map(() => '?').join(', ');
	const result = await db.execute({
		sql: `SELECT a.following_id AS user_id
		      FROM follow a
		      JOIN follow b ON b.follower_id = a.following_id AND b.following_id = a.follower_id
		      WHERE a.follower_id = ? AND a.following_id IN (${placeholders})`,
		args: [user_id, ...candidates]
	});

	return result.rows.map((row) => row.user_id as string);
}

// ==========================================
// Flock
// ==========================================

export type FlockState = {
	size: number;
	in_flight: number;
	available: number;
	next_available_at: string | null;
};

export async function count_pigeons_in_flight(user_id: string): Promise<number> {
	const result = await db.execute({
		sql: 'SELECT COUNT(*) AS in_flight FROM pigeon_flight WHERE sender_id = ? AND available_at > ?',
		args: [user_id, now_sql_timestamp()]
	});

	return Number(result.rows[0]?.in_flight ?? 0);
}

export async function get_flock_state(user_id: string): Promise<FlockState> {
	const now = now_sql_timestamp();

	const [user_result, flight_result] = await Promise.all([
		db.execute({ sql: 'SELECT verified FROM user WHERE id = ? LIMIT 1', args: [user_id] }),
		db.execute({
			sql: `SELECT COUNT(*) AS in_flight, MIN(available_at) AS next_available_at
			      FROM pigeon_flight
			      WHERE sender_id = ? AND available_at > ?`,
			args: [user_id, now]
		})
	]);

	const size = flock_size_for(Boolean(user_result.rows[0]?.verified));
	const in_flight = Number(flight_result.rows[0]?.in_flight ?? 0);
	const next_available_at = (flight_result.rows[0]?.next_available_at as string | null) ?? null;

	return {
		size,
		in_flight,
		available: Math.max(0, size - in_flight),
		next_available_at
	};
}

/**
 * Hard block when the coop is empty.
 *
 * Deliberately not race-proof: two simultaneous sends can both see the last
 * bird as available. The overrun is bounded at one pigeon and self-corrects, so
 * a counter column or a lock would cost more than the problem.
 */
export async function assert_pigeon_available(user_id: string): Promise<FlockState> {
	const flock = await get_flock_state(user_id);

	if (flock.available <= 0) {
		throw new PigeonError(409, 'no_pigeon_available', {
			next_available_at: flock.next_available_at,
			flock_size: flock.size
		});
	}

	return flock;
}

// ==========================================
// Participation guards
// ==========================================

export type ParticipantRow = {
	conversation_id: string;
	user_id: string;
	role: string;
	last_read_at: string | null;
	joined_at: string;
};

export async function get_participant(
	conversation_id: string,
	user_id: string
): Promise<ParticipantRow | null> {
	const result = await db.execute({
		sql: `SELECT conversation_id, user_id, role, last_read_at, joined_at
		      FROM conversation_participant
		      WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL
		      LIMIT 1`,
		args: [conversation_id, user_id]
	});

	const row = result.rows[0];
	if (!row) return null;

	return {
		conversation_id: row.conversation_id as string,
		user_id: row.user_id as string,
		role: row.role as string,
		last_read_at: (row.last_read_at as string | null) ?? null,
		joined_at: row.joined_at as string
	};
}

export async function assert_participant(
	conversation_id: string,
	user_id: string
): Promise<ParticipantRow> {
	const participant = await get_participant(conversation_id, user_id);
	if (!participant) throw new PigeonError(403, 'not_a_participant');

	return participant;
}

export type ConversationRow = {
	id: string;
	kind: string;
	title: string | null;
	direct_key: string | null;
	created_by: string | null;
};

export async function get_conversation(conversation_id: string): Promise<ConversationRow | null> {
	const result = await db.execute({
		sql: 'SELECT id, kind, title, direct_key, created_by FROM conversation WHERE id = ? LIMIT 1',
		args: [conversation_id]
	});

	const row = result.rows[0];
	if (!row) return null;

	return {
		id: row.id as string,
		kind: row.kind as string,
		title: (row.title as string | null) ?? null,
		direct_key: (row.direct_key as string | null) ?? null,
		created_by: (row.created_by as string | null) ?? null
	};
}

/** The other party in a direct conversation, read straight off direct_key. */
export function other_party_from_direct_key(direct_key: string, user_id: string): string | null {
	const [first_id, second_id] = direct_key.split(':');
	if (first_id === user_id) return second_id ?? null;
	if (second_id === user_id) return first_id ?? null;
	return null;
}

/**
 * Participation plus, for direct conversations, a still-mutual follow.
 *
 * Losing the mutual follow blocks sending but never reading: history stays
 * fully visible. Groups are gated at creation and member-add only, because
 * "whose unfollow breaks the group" has no coherent answer.
 */
export async function assert_can_send(
	conversation_id: string,
	user_id: string
): Promise<ParticipantRow> {
	const participant = await assert_participant(conversation_id, user_id);
	const conversation = await get_conversation(conversation_id);

	if (!conversation) throw new PigeonError(404, 'conversation_not_found');
	if (conversation.kind !== 'direct' || !conversation.direct_key) return participant;

	const other_user_id = other_party_from_direct_key(conversation.direct_key, user_id);
	if (!other_user_id) return participant;

	if (!(await are_mutual_follows(user_id, other_user_id))) {
		throw new PigeonError(403, 'not_mutual_follow');
	}

	return participant;
}

// ==========================================
// Conversation lifecycle
// ==========================================

export const min_group_members = 2;
export const max_group_members = 20;

async function get_active_participant_ids(conversation_id: string): Promise<string[]> {
	const result = await db.execute({
		sql: `SELECT user_id FROM conversation_participant
		      WHERE conversation_id = ? AND left_at IS NULL`,
		args: [conversation_id]
	});

	return result.rows.map((row) => row.user_id as string);
}

/**
 * Find or create the single direct conversation between two users.
 *
 * The INSERT ... SELECT ... WHERE direct_key = ? form matters: if a concurrent
 * request won the race, the conversation INSERT becomes a no-op and the
 * participants still attach to whichever row actually exists.
 */
export async function create_or_get_direct_conversation(
	user_id: string,
	other_user_id: string
): Promise<{ conversation_id: string; created: boolean }> {
	if (user_id === other_user_id) throw new PigeonError(400, 'cannot_message_yourself');

	if (!(await are_mutual_follows(user_id, other_user_id))) {
		throw new PigeonError(403, 'not_mutual_follow');
	}

	const direct_key = build_direct_key(user_id, other_user_id);

	const existing = await db.execute({
		sql: 'SELECT id FROM conversation WHERE direct_key = ? LIMIT 1',
		args: [direct_key]
	});

	if (existing.rows.length > 0) {
		return { conversation_id: existing.rows[0].id as string, created: false };
	}

	const conversation_id = crypto.randomUUID();
	const now = now_sql_timestamp();
	const attach_participant = (participant_id: string) => ({
		sql: `INSERT OR IGNORE INTO conversation_participant (conversation_id, user_id, role, joined_at)
		      SELECT id, ?, 'member', ? FROM conversation WHERE direct_key = ?`,
		args: [participant_id, now, direct_key]
	});

	await db.batch(
		[
			{
				sql: `INSERT INTO conversation (id, kind, direct_key, created_by, created_at, updated_at)
				      VALUES (?, 'direct', ?, ?, ?, ?)
				      ON CONFLICT(direct_key) DO NOTHING`,
				args: [conversation_id, direct_key, user_id, now, now]
			},
			attach_participant(user_id),
			attach_participant(other_user_id)
		],
		'write'
	);

	// Re-read rather than trusting our own id: on a lost race the winner's row wins.
	const settled = await db.execute({
		sql: 'SELECT id FROM conversation WHERE direct_key = ? LIMIT 1',
		args: [direct_key]
	});

	const settled_id = settled.rows[0]?.id as string | undefined;
	if (!settled_id) throw new PigeonError(500, 'conversation_not_created');

	return { conversation_id: settled_id, created: settled_id === conversation_id };
}

export async function create_group_conversation(
	user_id: string,
	member_ids: string[],
	title: string | null
): Promise<{ conversation_id: string }> {
	const members = Array.from(new Set(member_ids.filter((id) => id !== user_id)));

	if (members.length < min_group_members || members.length > max_group_members) {
		throw new PigeonError(409, 'group_size_out_of_range', {
			min: min_group_members,
			max: max_group_members
		});
	}

	// Every initial member must be mutual with the creator. Reject the whole
	// request rather than quietly dropping whoever did not qualify.
	const mutual = await filter_mutual_follows(user_id, members);
	const not_mutual = members.filter((id) => !mutual.includes(id));
	if (not_mutual.length > 0) {
		throw new PigeonError(403, 'not_mutual_follow', { user_ids: not_mutual });
	}

	const coords = await get_home_coords_many(members);
	const without_home = members.filter((id) => !coords.has(id));
	if (without_home.length > 0) {
		throw new PigeonError(409, 'recipient_home_unset', { user_ids: without_home });
	}

	const conversation_id = crypto.randomUUID();
	const now = now_sql_timestamp();
	const clean_title = title?.trim().slice(0, 80) || null;

	await db.batch(
		[
			{
				sql: `INSERT INTO conversation (id, kind, title, direct_key, created_by, created_at, updated_at)
				      VALUES (?, 'group', ?, NULL, ?, ?, ?)`,
				args: [conversation_id, clean_title, user_id, now, now]
			},
			{
				sql: `INSERT INTO conversation_participant (conversation_id, user_id, role, joined_at)
				      VALUES (?, ?, 'owner', ?)`,
				args: [conversation_id, user_id, now]
			},
			...members.map((member_id) => ({
				sql: `INSERT INTO conversation_participant (conversation_id, user_id, role, joined_at)
				      VALUES (?, ?, 'member', ?)`,
				args: [conversation_id, member_id, now]
			}))
		],
		'write'
	);

	return { conversation_id };
}

/** Owner only, group only, and each new member must be mutual with the owner. */
export async function add_group_members(
	conversation_id: string,
	actor_id: string,
	member_ids: string[]
): Promise<string[]> {
	const participant = await assert_participant(conversation_id, actor_id);
	if (participant.role !== 'owner') throw new PigeonError(403, 'not_group_owner');

	const conversation = await get_conversation(conversation_id);
	if (!conversation) throw new PigeonError(404, 'conversation_not_found');
	if (conversation.kind !== 'group') throw new PigeonError(403, 'not_a_group');

	const existing = await get_active_participant_ids(conversation_id);
	const additions = Array.from(
		new Set(member_ids.filter((id) => id !== actor_id && !existing.includes(id)))
	);

	if (additions.length === 0) return [];
	if (existing.length + additions.length > max_group_members + 1) {
		throw new PigeonError(409, 'group_size_out_of_range', { max: max_group_members });
	}

	const mutual = await filter_mutual_follows(actor_id, additions);
	const not_mutual = additions.filter((id) => !mutual.includes(id));
	if (not_mutual.length > 0) {
		throw new PigeonError(403, 'not_mutual_follow', { user_ids: not_mutual });
	}

	const coords = await get_home_coords_many(additions);
	const without_home = additions.filter((id) => !coords.has(id));
	if (without_home.length > 0) {
		throw new PigeonError(409, 'recipient_home_unset', { user_ids: without_home });
	}

	const now = now_sql_timestamp();
	await db.batch(
		additions.map((member_id) => ({
			sql: `INSERT INTO conversation_participant (conversation_id, user_id, role, joined_at, left_at)
			      VALUES (?, ?, 'member', ?, NULL)
			      ON CONFLICT(conversation_id, user_id)
			      DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at`,
			args: [conversation_id, member_id, now]
		})),
		'write'
	);

	return additions;
}

export async function leave_conversation(conversation_id: string, user_id: string): Promise<void> {
	await db.execute({
		sql: `UPDATE conversation_participant SET left_at = ?
		      WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL`,
		args: [now_sql_timestamp(), conversation_id, user_id]
	});
}

// ==========================================
// Releasing a pigeon
// ==========================================

export type PendingAttachment = {
	url: string;
	key: string;
	media_type?: string;
	file_name?: string | null;
	byte_size?: number | null;
	width?: number | null;
	height?: number | null;
};

export type FlightSummary = {
	id: string;
	conversation_id: string;
	route: RouteLeg[];
	total_distance_km: number;
	departed_at: string;
	available_at: string;
	status: string;
	recalled_at: string | null;
};

export type MessageSummary = {
	id: string;
	conversation_id: string;
	sender_id: string;
	body: string;
	attachment_count: number;
	departed_at: string;
};

export type FlightResult = {
	message: MessageSummary;
	flight: FlightSummary;
	deliveries: { recipient_id: string; deliver_at: string; distance_km: number }[];
	server_now: number;
};

/** Coordinates are snapped before they are stored, so no exact position is ever persisted in a payload. */
function fuzz_route(route: RouteLeg[]): RouteLeg[] {
	return route.map((leg) => ({
		from: fuzz_for_map(leg.from),
		to: fuzz_for_map(leg.to),
		recipient_id: leg.recipient_id,
		distance_km: leg.distance_km
	}));
}

export const max_message_length = 2000;
export const max_attachments_per_message = 4;

/**
 * Release one bird carrying one message to every participant.
 *
 * Timing is computed from exact coordinates; route_json stores the fuzzed
 * version. Everything is worked out in JS before the batch, which is what makes
 * a single atomic write safe here.
 */
export async function release_pigeon(
	conversation_id: string,
	sender_id: string,
	body: string,
	attachments: PendingAttachment[] = []
): Promise<FlightResult> {
	if (body.length > max_message_length) throw new PigeonError(400, 'message_too_long');
	if (attachments.length > max_attachments_per_message) {
		throw new PigeonError(400, 'too_many_attachments');
	}
	if (body.trim().length === 0 && attachments.length === 0) {
		throw new PigeonError(400, 'empty_message');
	}

	await assert_can_send(conversation_id, sender_id);
	await assert_pigeon_available(sender_id);

	const origin = await get_home_coords(sender_id);
	if (!origin) throw new PigeonError(409, 'sender_home_unset');

	const participant_ids = await get_active_participant_ids(conversation_id);
	const recipient_ids = participant_ids.filter((id) => id !== sender_id);
	if (recipient_ids.length === 0) throw new PigeonError(409, 'no_recipients');

	const coords = await get_home_coords_many(recipient_ids);
	const without_home = recipient_ids.filter((id) => !coords.has(id));
	if (without_home.length > 0) {
		throw new PigeonError(409, 'recipient_home_unset', { user_ids: without_home });
	}

	// Warm the distance cache while we have the coordinates in hand.
	await get_pair_distances_km(sender_id, recipient_ids);

	const route = plan_route(
		origin,
		recipient_ids.map((user_id) => ({ user_id, coords: coords.get(user_id) as Coords }))
	);

	const departed_at_ms = Date.now();
	const departed_at = sql_timestamp_from_epoch(departed_at_ms);
	const available_at_ms = available_at_for(route, departed_at_ms);
	const available_at = sql_timestamp_from_epoch(available_at_ms);
	const total_distance_km = route_total_km(route);
	const schedule = delivery_schedule(route, departed_at_ms);

	const flight_id = crypto.randomUUID();
	const message_id = crypto.randomUUID();
	const fuzzed_route = fuzz_route(route);

	await db.batch(
		[
			{
				sql: `INSERT INTO pigeon_flight (id, sender_id, conversation_id, route_json,
				                                total_distance_km, departed_at, available_at, status)
				      VALUES (?, ?, ?, ?, ?, ?, ?, 'in_flight')`,
				args: [
					flight_id,
					sender_id,
					conversation_id,
					JSON.stringify(fuzzed_route),
					total_distance_km,
					departed_at,
					available_at
				]
			},
			{
				sql: `INSERT INTO message (id, conversation_id, flight_id, sender_id, body,
				                          attachment_count, departed_at, created_at)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					message_id,
					conversation_id,
					flight_id,
					sender_id,
					body,
					attachments.length,
					departed_at,
					departed_at
				]
			},
			...schedule.map((stop) => ({
				sql: `INSERT INTO message_delivery (message_id, recipient_id, leg_order, distance_km, deliver_at)
				      VALUES (?, ?, ?, ?, ?)`,
				args: [
					message_id,
					stop.recipient_id,
					stop.leg_order,
					stop.distance_km,
					sql_timestamp_from_epoch(stop.deliver_at)
				]
			})),
			...attachments.map((attachment) => ({
				sql: `INSERT INTO message_attachment (id, message_id, media_url, media_type, storage_key,
				                                     file_name, byte_size, width, height, created_at)
				      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					crypto.randomUUID(),
					message_id,
					attachment.url,
					attachment.media_type ?? 'image',
					attachment.key,
					attachment.file_name ?? null,
					attachment.byte_size ?? null,
					attachment.width ?? null,
					attachment.height ?? null,
					departed_at
				]
			})),
			{
				// The sender has, by definition, read their own message.
				sql: `UPDATE conversation_participant SET last_read_at = ?
				      WHERE conversation_id = ? AND user_id = ?`,
				args: [departed_at, conversation_id, sender_id]
			},
			{
				sql: 'UPDATE conversation SET updated_at = ? WHERE id = ?',
				args: [departed_at, conversation_id]
			}
		],
		'write'
	);

	return {
		message: {
			id: message_id,
			conversation_id,
			sender_id,
			body,
			attachment_count: attachments.length,
			departed_at
		},
		flight: {
			id: flight_id,
			conversation_id,
			route: fuzzed_route,
			total_distance_km,
			departed_at,
			available_at,
			status: 'in_flight',
			recalled_at: null
		},
		deliveries: schedule.map((stop) => ({
			recipient_id: stop.recipient_id,
			deliver_at: sql_timestamp_from_epoch(stop.deliver_at),
			distance_km: stop.distance_km
		})),
		server_now: departed_at_ms
	};
}

// ==========================================
// Recall
// ==========================================

export type RecallResult = {
	flight_id: string;
	available_at: string;
	return_distance_km: number;
	cancelled_recipient_ids: string[];
	server_now: number;
};

/**
 * Turn a bird around mid-flight.
 *
 * Recipients already reached keep their message; the rest are cancelled. The
 * return leg is flown from wherever the bird actually is, so recalling a pigeon
 * halfway to Tokyo still costs the flight home.
 */
export async function recall_pigeon(flight_id: string, sender_id: string): Promise<RecallResult> {
	const result = await db.execute({
		sql: `SELECT id, sender_id, route_json, departed_at, available_at, status
		      FROM pigeon_flight WHERE id = ? LIMIT 1`,
		args: [flight_id]
	});

	const row = result.rows[0];
	if (!row) throw new PigeonError(404, 'flight_not_found');
	if (row.sender_id !== sender_id) throw new PigeonError(403, 'not_your_pigeon');
	if (row.status !== 'in_flight') throw new PigeonError(409, 'nothing_to_recall');

	const route = JSON.parse(row.route_json as string) as RouteLeg[];
	const departed_at_ms = epoch_from_sql_timestamp(row.departed_at as string);
	const recalled_at_ms = Date.now();

	if (recalled_at_ms >= epoch_from_sql_timestamp(row.available_at as string)) {
		throw new PigeonError(409, 'nothing_to_recall');
	}

	const recall = plan_recall(route, departed_at_ms, recalled_at_ms, route[0].from);

	if (recall.cancelled_recipient_ids.length === 0) {
		// Every recipient already has it; the bird is only flying home now.
		throw new PigeonError(409, 'nothing_to_recall');
	}

	const recalled_at = sql_timestamp_from_epoch(recalled_at_ms);
	const available_at = sql_timestamp_from_epoch(recall.available_at);

	await db.batch(
		[
			{
				sql: `UPDATE message_delivery SET cancelled_at = ?
				      WHERE message_id IN (SELECT id FROM message WHERE flight_id = ?)
				        AND deliver_at > ? AND cancelled_at IS NULL`,
				args: [recalled_at, flight_id, recalled_at]
			},
			{
				sql: `UPDATE pigeon_flight SET status = 'recalled', recalled_at = ?, available_at = ?
				      WHERE id = ?`,
				args: [recalled_at, available_at, flight_id]
			}
		],
		'write'
	);

	return {
		flight_id,
		available_at,
		return_distance_km: recall.return_distance_km,
		cancelled_recipient_ids: recall.cancelled_recipient_ids,
		server_now: recalled_at_ms
	};
}

// ==========================================
// Reading
// ==========================================

export type ConversationSummary = {
	id: string;
	kind: string;
	title: string | null;
	last_activity_at: string | null;
	last_body: string | null;
	last_sender_id: string | null;
	unread_count: number;
	participants: PigeonFriend[];
};

/**
 * The inbox.
 *
 * Ordering cannot use a denormalized last_message_at column, because with
 * distance-delayed delivery "the latest message" is per viewer and arrival
 * happens by clock rather than by a write. The correlated subqueries below are
 * cheap because the flock caps how many messages can exist at all.
 */
export async function list_inbox(user_id: string, limit = 30): Promise<ConversationSummary[]> {
	const now = now_sql_timestamp();
	const safe_limit = Math.min(Math.max(limit, 1), 100);

	const result = await db.execute({
		sql: `SELECT c.id, c.kind, c.title,
		             (SELECT MAX(md.deliver_at) FROM message_delivery md
		              JOIN message m ON m.id = md.message_id
		              WHERE m.conversation_id = c.id AND md.recipient_id = ?
		                AND md.cancelled_at IS NULL AND md.deliver_at <= ?
		                AND m.deleted_at IS NULL) AS last_delivered_at,
		             (SELECT MAX(m.departed_at) FROM message m
		              WHERE m.conversation_id = c.id AND m.sender_id = ?
		                AND m.deleted_at IS NULL) AS last_own_at,
		             (SELECT m.body FROM message_delivery md
		              JOIN message m ON m.id = md.message_id
		              WHERE m.conversation_id = c.id AND md.recipient_id = ?
		                AND md.cancelled_at IS NULL AND md.deliver_at <= ?
		                AND m.deleted_at IS NULL
		              ORDER BY md.deliver_at DESC LIMIT 1) AS last_body,
		             (SELECT m.sender_id FROM message_delivery md
		              JOIN message m ON m.id = md.message_id
		              WHERE m.conversation_id = c.id AND md.recipient_id = ?
		                AND md.cancelled_at IS NULL AND md.deliver_at <= ?
		                AND m.deleted_at IS NULL
		              ORDER BY md.deliver_at DESC LIMIT 1) AS last_sender_id,
		             (SELECT COUNT(*) FROM message_delivery md
		              JOIN message m ON m.id = md.message_id
		              WHERE m.conversation_id = c.id AND md.recipient_id = ?
		                AND md.cancelled_at IS NULL AND md.deliver_at <= ?
		                AND m.deleted_at IS NULL
		                AND (cp.last_read_at IS NULL OR md.deliver_at > cp.last_read_at)) AS unread_count
		      FROM conversation_participant cp
		      JOIN conversation c ON c.id = cp.conversation_id
		      WHERE cp.user_id = ? AND cp.left_at IS NULL
		      ORDER BY MAX(IFNULL(last_delivered_at, ''), IFNULL(last_own_at, '')) DESC
		      LIMIT ?`,
		args: [user_id, now, user_id, user_id, now, user_id, now, user_id, now, user_id, safe_limit]
	});

	const summaries: ConversationSummary[] = result.rows.map((row) => {
		const last_delivered_at = (row.last_delivered_at as string | null) ?? null;
		const last_own_at = (row.last_own_at as string | null) ?? null;

		return {
			id: row.id as string,
			kind: row.kind as string,
			title: (row.title as string | null) ?? null,
			last_activity_at:
				[last_delivered_at, last_own_at]
					.filter((value): value is string => value !== null)
					.sort()
					.at(-1) ?? null,
			last_body: (row.last_body as string | null) ?? null,
			last_sender_id: (row.last_sender_id as string | null) ?? null,
			unread_count: Number(row.unread_count ?? 0),
			participants: []
		};
	});

	if (summaries.length === 0) return summaries;

	const participants = await get_participants_for(summaries.map((summary) => summary.id));
	for (const summary of summaries) {
		summary.participants = (participants.get(summary.id) ?? []).filter(
			(participant) => participant.id !== user_id
		);
	}

	return summaries;
}

/** Participant profiles for a set of conversations, in one query. */
async function get_participants_for(
	conversation_ids: string[]
): Promise<Map<string, PigeonFriend[]>> {
	const grouped = new Map<string, PigeonFriend[]>();
	if (conversation_ids.length === 0) return grouped;

	const placeholders = conversation_ids.map(() => '?').join(', ');
	const result = await db.execute({
		sql: `SELECT cp.conversation_id, u.id, u.name, u.username, u.image, u.verified
		      FROM conversation_participant cp
		      JOIN user u ON u.id = cp.user_id
		      WHERE cp.conversation_id IN (${placeholders}) AND cp.left_at IS NULL`,
		args: conversation_ids
	});

	for (const row of result.rows) {
		const conversation_id = row.conversation_id as string;
		const list = grouped.get(conversation_id) ?? [];
		list.push({
			id: row.id as string,
			name: (row.name as string) || 'Unknown',
			handle: normalize_handle(row.username) || 'user',
			avatar: (row.image as string) || '',
			verified: Boolean(row.verified)
		});
		grouped.set(conversation_id, list);
	}

	return grouped;
}

export async function count_unread_conversations(user_id: string): Promise<number> {
	const result = await db.execute({
		sql: `SELECT COUNT(DISTINCT m.conversation_id) AS unread_conversations
		      FROM message_delivery md
		      JOIN message m ON m.id = md.message_id
		      JOIN conversation_participant cp
		        ON cp.conversation_id = m.conversation_id AND cp.user_id = md.recipient_id
		      WHERE md.recipient_id = ?
		        AND md.cancelled_at IS NULL
		        AND md.deliver_at <= ?
		        AND m.deleted_at IS NULL
		        AND cp.left_at IS NULL
		        AND (cp.last_read_at IS NULL OR md.deliver_at > cp.last_read_at)`,
		args: [user_id, now_sql_timestamp()]
	});

	return Number(result.rows[0]?.unread_conversations ?? 0);
}

/**
 * When this user's next pigeon lands.
 *
 * Used to schedule a single timer instead of polling. Never render it: telling
 * a recipient that something arrives in three days spoils the arrival and leaks
 * that someone is writing to them.
 */
export async function get_next_arrival_at(user_id: string): Promise<string | null> {
	const result = await db.execute({
		sql: `SELECT MIN(md.deliver_at) AS next_arrival_at
		      FROM message_delivery md
		      JOIN message m ON m.id = md.message_id
		      WHERE md.recipient_id = ? AND md.cancelled_at IS NULL
		        AND m.deleted_at IS NULL AND md.deliver_at > ?`,
		args: [user_id, now_sql_timestamp()]
	});

	return (result.rows[0]?.next_arrival_at as string | null) ?? null;
}

export async function mark_conversation_read(
	conversation_id: string,
	user_id: string,
	up_to?: string | null
): Promise<void> {
	const now = now_sql_timestamp();
	// A client cannot mark itself read into the future.
	const marker = up_to && up_to < now ? up_to : now;

	await db.execute({
		sql: `UPDATE conversation_participant SET last_read_at = ?
		      WHERE conversation_id = ? AND user_id = ?
		        AND (last_read_at IS NULL OR last_read_at < ?)`,
		args: [marker, conversation_id, user_id, marker]
	});
}

export type ThreadMessage = {
	id: string;
	sender_id: string;
	body: string;
	attachment_count: number;
	/** When this message became visible to the viewer. */
	visible_at: string;
	is_own: boolean;
	sender: PigeonFriend | null;
	attachments: { url: string; media_type: string; width: number | null; height: number | null }[];
	/** Present only on the viewer's own messages: the bird carrying it. */
	flight: FlightSummary | null;
	/** Present only on the viewer's own messages: per-recipient arrivals. */
	deliveries: { recipient_id: string; deliver_at: string; cancelled_at: string | null }[];
};

export type ConversationMeta = {
	id: string;
	kind: string;
	title: string | null;
	participants: PigeonFriend[];
	can_send: boolean;
	block_reason: string | null;
};

export async function get_conversation_meta(
	conversation_id: string,
	user_id: string
): Promise<ConversationMeta> {
	await assert_participant(conversation_id, user_id);

	const conversation = await get_conversation(conversation_id);
	if (!conversation) throw new PigeonError(404, 'conversation_not_found');

	const participants = (await get_participants_for([conversation_id])).get(conversation_id) ?? [];

	let can_send = true;
	let block_reason: string | null = null;

	if (conversation.kind === 'direct' && conversation.direct_key) {
		const other_user_id = other_party_from_direct_key(conversation.direct_key, user_id);
		if (other_user_id && !(await are_mutual_follows(user_id, other_user_id))) {
			can_send = false;
			block_reason = 'not_mutual_follow';
		}
	}

	if (can_send && !(await has_home_coords(user_id))) {
		can_send = false;
		block_reason = 'sender_home_unset';
	}

	return {
		id: conversation.id,
		kind: conversation.kind,
		title: conversation.title,
		participants: participants.filter((participant) => participant.id !== user_id),
		can_send,
		block_reason
	};
}

/**
 * A conversation thread from one viewer's perspective.
 *
 * Two different visibility rules apply, so this is two reads merged in JS:
 * received messages appear once deliver_at has passed, while the viewer's own
 * messages are visible from the moment they depart, carrying their flight.
 */
export async function get_thread(
	conversation_id: string,
	user_id: string,
	options: { limit?: number } = {}
): Promise<{ messages: ThreadMessage[]; server_now: number }> {
	await assert_participant(conversation_id, user_id);

	const now_ms = Date.now();
	const now = sql_timestamp_from_epoch(now_ms);
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

	const [received_result, own_result] = await Promise.all([
		db.execute({
			sql: `SELECT m.id, m.sender_id, m.body, m.attachment_count, md.deliver_at AS visible_at
			      FROM message_delivery md
			      JOIN message m ON m.id = md.message_id
			      WHERE md.recipient_id = ?
			        AND m.conversation_id = ?
			        AND md.cancelled_at IS NULL
			        AND md.deliver_at <= ?
			        AND m.deleted_at IS NULL
			      ORDER BY md.deliver_at DESC
			      LIMIT ?`,
			args: [user_id, conversation_id, now, limit]
		}),
		db.execute({
			sql: `SELECT m.id, m.sender_id, m.body, m.attachment_count, m.departed_at AS visible_at,
			             f.id AS flight_id, f.route_json, f.total_distance_km,
			             f.departed_at AS flight_departed_at, f.available_at, f.status, f.recalled_at
			      FROM message m
			      JOIN pigeon_flight f ON f.id = m.flight_id
			      WHERE m.conversation_id = ? AND m.sender_id = ? AND m.deleted_at IS NULL
			      ORDER BY m.departed_at DESC
			      LIMIT ?`,
			args: [conversation_id, user_id, limit]
		})
	]);

	const messages: ThreadMessage[] = [
		...received_result.rows.map((row) => ({
			id: row.id as string,
			sender_id: row.sender_id as string,
			body: row.body as string,
			attachment_count: Number(row.attachment_count ?? 0),
			visible_at: row.visible_at as string,
			is_own: false,
			sender: null,
			attachments: [],
			flight: null,
			deliveries: []
		})),
		...own_result.rows.map((row) => ({
			id: row.id as string,
			sender_id: row.sender_id as string,
			body: row.body as string,
			attachment_count: Number(row.attachment_count ?? 0),
			visible_at: row.visible_at as string,
			is_own: true,
			sender: null,
			attachments: [],
			flight: {
				id: row.flight_id as string,
				conversation_id,
				route: JSON.parse(row.route_json as string) as RouteLeg[],
				total_distance_km: Number(row.total_distance_km ?? 0),
				departed_at: row.flight_departed_at as string,
				available_at: row.available_at as string,
				status: row.status as string,
				recalled_at: (row.recalled_at as string | null) ?? null
			},
			deliveries: []
		}))
	]
		.sort((a, b) => (a.visible_at < b.visible_at ? 1 : a.visible_at > b.visible_at ? -1 : 0))
		.slice(0, limit);

	await Promise.all([
		attach_senders(messages, conversation_id),
		attach_attachments(messages),
		attach_deliveries(messages)
	]);

	return { messages: messages.reverse(), server_now: now_ms };
}

async function attach_senders(messages: ThreadMessage[], conversation_id: string): Promise<void> {
	if (messages.length === 0) return;

	const participants = (await get_participants_for([conversation_id])).get(conversation_id) ?? [];
	const by_id = new Map(participants.map((participant) => [participant.id, participant]));

	for (const message of messages) {
		message.sender = by_id.get(message.sender_id) ?? null;
	}
}

async function attach_attachments(messages: ThreadMessage[]): Promise<void> {
	const with_attachments = messages.filter((message) => message.attachment_count > 0);
	if (with_attachments.length === 0) return;

	const placeholders = with_attachments.map(() => '?').join(', ');
	const result = await db.execute({
		sql: `SELECT message_id, media_url, media_type, width, height
		      FROM message_attachment
		      WHERE message_id IN (${placeholders})
		      ORDER BY created_at ASC`,
		args: with_attachments.map((message) => message.id)
	});

	const by_message = new Map<string, ThreadMessage['attachments']>();
	for (const row of result.rows) {
		const message_id = row.message_id as string;
		const list = by_message.get(message_id) ?? [];
		list.push({
			url: row.media_url as string,
			media_type: (row.media_type as string) || 'image',
			width: row.width === null ? null : Number(row.width),
			height: row.height === null ? null : Number(row.height)
		});
		by_message.set(message_id, list);
	}

	for (const message of with_attachments) {
		message.attachments = by_message.get(message.id) ?? [];
	}
}

async function attach_deliveries(messages: ThreadMessage[]): Promise<void> {
	const own = messages.filter((message) => message.is_own);
	if (own.length === 0) return;

	const placeholders = own.map(() => '?').join(', ');
	const result = await db.execute({
		sql: `SELECT message_id, recipient_id, deliver_at, cancelled_at
		      FROM message_delivery
		      WHERE message_id IN (${placeholders})
		      ORDER BY deliver_at ASC`,
		args: own.map((message) => message.id)
	});

	const by_message = new Map<string, ThreadMessage['deliveries']>();
	for (const row of result.rows) {
		const message_id = row.message_id as string;
		const list = by_message.get(message_id) ?? [];
		list.push({
			recipient_id: row.recipient_id as string,
			deliver_at: row.deliver_at as string,
			cancelled_at: (row.cancelled_at as string | null) ?? null
		});
		by_message.set(message_id, list);
	}

	for (const message of own) {
		message.deliveries = by_message.get(message.id) ?? [];
	}
}
