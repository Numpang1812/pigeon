import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The db module is mocked rather than @libsql/client, which keeps
 * $env/dynamic/private out of the picture entirely. Mocks are registered before
 * the dynamic import below, following the discipline in src/server/server.test.ts.
 */

type QueryCall = { sql: string; args: unknown[] };

const executed: QueryCall[] = [];
const batched: QueryCall[][] = [];

let next_rows: Record<string, unknown>[][] = [];

function queue_rows(...results: Record<string, unknown>[][]): void {
	next_rows = [...results];
}

const mock_execute = vi.fn(async (query: QueryCall | string) => {
	const normalized: QueryCall = typeof query === 'string' ? { sql: query, args: [] } : query;
	executed.push(normalized);
	return { rows: next_rows.shift() ?? [] };
});

const mock_batch = vi.fn(async (queries: QueryCall[]) => {
	batched.push(queries);
	return [];
});

vi.mock('$lib/server/db', () => ({
	db: { execute: mock_execute, batch: mock_batch }
}));
vi.mock('./db', () => ({
	db: { execute: mock_execute, batch: mock_batch }
}));

const {
	are_mutual_follows,
	assert_can_send,
	assert_participant,
	assert_pigeon_available,
	build_direct_key,
	epoch_from_sql_timestamp,
	get_flock_state,
	get_mutual_follows,
	get_pair_distance_km,
	count_unread_conversations,
	get_next_arrival_at,
	get_thread,
	mark_conversation_read,
	now_sql_timestamp,
	other_party_from_direct_key,
	// Aliased to snake_case because the project lints variable names, and a
	// destructured import is a variable rather than a class declaration.
	PigeonError: pigeon_error,
	recall_pigeon,
	release_pigeon,
	set_home_coords,
	sort_pair,
	sql_timestamp_from_epoch
} = await import('./pigeon-post');

const phnom_penh = { home_lat: 11.5564, home_lng: 104.9282 };
const tokyo = { home_lat: 35.6762, home_lng: 139.6503 };

/** Every SQL string issued since the last reset, whether via execute or batch. */
function all_sql(): string {
	return [...executed.map((call) => call.sql), ...batched.flat().map((call) => call.sql)].join(
		'\n'
	);
}

beforeEach(() => {
	executed.length = 0;
	batched.length = 0;
	next_rows = [];
	mock_execute.mockClear();
	mock_batch.mockClear();
});

describe('timestamps', () => {
	it('formats without a trailing Z so it sorts against datetime(now)', () => {
		expect(now_sql_timestamp()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
		expect(now_sql_timestamp()).not.toContain('Z');
	});

	it('round-trips through epoch milliseconds', () => {
		const stamp = now_sql_timestamp();

		expect(sql_timestamp_from_epoch(epoch_from_sql_timestamp(stamp))).toBe(stamp);
	});

	it('keeps millisecond precision, which unread comparisons depend on', () => {
		const epoch = Date.UTC(2026, 0, 2, 3, 4, 5, 678);

		expect(sql_timestamp_from_epoch(epoch)).toBe('2026-01-02 03:04:05.678');
	});
});

describe('pair keys', () => {
	it('sorts a pair the same way regardless of argument order', () => {
		expect(sort_pair('zeta', 'alpha')).toEqual(sort_pair('alpha', 'zeta'));
	});

	it('builds the same direct key in both directions', () => {
		// The entire 1:1 dedupe rests on this.
		expect(build_direct_key('user_b', 'user_a')).toBe(build_direct_key('user_a', 'user_b'));
	});

	it('reads the other party back out of a direct key', () => {
		const key = build_direct_key('user_a', 'user_b');

		expect(other_party_from_direct_key(key, 'user_a')).toBe('user_b');
		expect(other_party_from_direct_key(key, 'user_b')).toBe('user_a');
		expect(other_party_from_direct_key(key, 'user_c')).toBeNull();
	});
});

describe('set_home_coords', () => {
	it('always invalidates cached distances in the same batch as the write', async () => {
		await set_home_coords('user_a', { lat: 11.5564, lng: 104.9282 }, 25);

		expect(mock_batch).toHaveBeenCalledTimes(1);

		const statements = batched[0];
		expect(statements).toHaveLength(2);
		expect(statements[0].sql).toContain('UPDATE user SET home_lat');
		expect(statements[1].sql).toContain('DELETE FROM user_distance');
		// Both orientations, or a user who moves keeps half their stale distances.
		expect(statements[1].sql).toContain('user_a_id = ? OR user_b_id = ?');
	});

	it('rejects coordinates outside the valid range', async () => {
		await expect(set_home_coords('user_a', { lat: 999, lng: 0 }, null)).rejects.toBeInstanceOf(
			pigeon_error
		);
		expect(mock_batch).not.toHaveBeenCalled();
	});
});

describe('get_pair_distance_km', () => {
	it('returns the cached value with a single query and never reads coordinates', async () => {
		queue_rows([{ distance_km: 530.4 }]);

		const distance = await get_pair_distance_km('user_b', 'user_a');

		expect(distance).toBeCloseTo(530.4, 6);
		expect(executed).toHaveLength(1);
		expect(all_sql()).not.toContain('home_lat');
	});

	it('computes and stores the distance on a cache miss', async () => {
		queue_rows(
			[],
			[
				{ id: 'user_a', home_lat: 11.5564, home_lng: 104.9282 },
				{ id: 'user_b', home_lat: 13.7563, home_lng: 100.5018 }
			]
		);

		const distance = await get_pair_distance_km('user_a', 'user_b');

		expect(distance).toBeGreaterThan(510);
		expect(distance).toBeLessThan(560);
		expect(all_sql()).toContain('INSERT INTO user_distance');
		// Concurrent first sends must not collide; both compute the same number.
		expect(all_sql()).toContain('DO NOTHING');
	});

	it('refuses when either user has no home loft', async () => {
		queue_rows([], [{ id: 'user_a', home_lat: 11.5564, home_lng: 104.9282 }]);

		await expect(get_pair_distance_km('user_a', 'user_b')).rejects.toBeInstanceOf(pigeon_error);
	});
});

describe('get_mutual_follows', () => {
	it('joins follow twice and never ORs the two directions together', async () => {
		queue_rows([]);

		await get_mutual_follows('user_a');

		const sql = all_sql();
		expect(sql).toContain('FROM follow f_out');
		expect(sql).toContain('JOIN follow f_in');
		// The reciprocal ON clause is what makes this AND rather than OR.
		expect(sql).toContain('f_in.follower_id = f_out.following_id');
		expect(sql).toContain('f_in.following_id = f_out.follower_id');
		// An OR here would mean "either direction", which is what
		// build_post_visibility_clause does — a different question entirely.
		expect(sql).not.toMatch(/\sOR\s/);
	});

	it('excludes users with no coordinates, who cannot receive a pigeon', async () => {
		queue_rows([]);

		await get_mutual_follows('user_a');

		expect(all_sql()).toContain('u.home_lat IS NOT NULL');
	});

	it('maps rows into friend records', async () => {
		queue_rows([{ id: 'user_b', name: 'Bee', username: '@Bee_01', image: null, verified: 1 }]);

		const [friend] = await get_mutual_follows('user_a');

		// normalize_handle strips a leading @ and trims; it does not lowercase.
		expect(friend).toEqual({
			id: 'user_b',
			name: 'Bee',
			handle: 'Bee_01',
			avatar: '',
			verified: true
		});
	});

	it('clamps the limit to a sane ceiling', async () => {
		queue_rows([]);

		await get_mutual_follows('user_a', { limit: 5000 });

		expect(executed[0].args.at(-1)).toBe(100);
	});
});

describe('are_mutual_follows', () => {
	it('is false for a user and themselves without querying', async () => {
		expect(await are_mutual_follows('user_a', 'user_a')).toBe(false);
		expect(mock_execute).not.toHaveBeenCalled();
	});

	it('is true when the join returns a row', async () => {
		queue_rows([{ 1: 1 }]);

		expect(await are_mutual_follows('user_a', 'user_b')).toBe(true);
	});

	it('is false when the join is empty', async () => {
		queue_rows([]);

		expect(await are_mutual_follows('user_a', 'user_b')).toBe(false);
	});
});

describe('flock', () => {
	it('counts only birds that are still out', async () => {
		queue_rows([{ verified: 0 }], [{ in_flight: 3, next_available_at: '2026-08-17 12:00:00.000' }]);

		const flock = await get_flock_state('user_a');

		expect(flock).toEqual({
			size: 10,
			in_flight: 3,
			available: 7,
			next_available_at: '2026-08-17 12:00:00.000'
		});
		expect(all_sql()).toContain('available_at > ?');
	});

	it('gives verified users a bigger flock', async () => {
		queue_rows([{ verified: 1 }], [{ in_flight: 0, next_available_at: null }]);

		expect((await get_flock_state('user_a')).size).toBe(20);
	});

	it('blocks sending when the coop is empty and reports when a bird lands', async () => {
		queue_rows(
			[{ verified: 0 }],
			[{ in_flight: 10, next_available_at: '2026-08-17 18:30:00.000' }]
		);

		const failure = await assert_pigeon_available('user_a').catch((error) => error);

		expect(failure).toBeInstanceOf(pigeon_error);
		expect(failure.status).toBe(409);
		expect(failure.body).toEqual({
			error: 'no_pigeon_available',
			next_available_at: '2026-08-17 18:30:00.000',
			flock_size: 10
		});
	});

	it('allows sending while a bird remains', async () => {
		queue_rows([{ verified: 0 }], [{ in_flight: 9, next_available_at: '2026-08-17 18:30:00.000' }]);

		expect((await assert_pigeon_available('user_a')).available).toBe(1);
	});
});

describe('assert_participant', () => {
	it('rejects a non-participant with 403', async () => {
		queue_rows([]);

		const failure = await assert_participant('conversation_1', 'user_c').catch((error) => error);

		expect(failure).toBeInstanceOf(pigeon_error);
		expect(failure.status).toBe(403);
	});

	it('ignores participants who have left', async () => {
		queue_rows([]);

		await assert_participant('conversation_1', 'user_a').catch(() => undefined);

		expect(all_sql()).toContain('left_at IS NULL');
	});
});

describe('assert_can_send', () => {
	const participant = [
		{
			conversation_id: 'conversation_1',
			user_id: 'user_a',
			role: 'member',
			last_read_at: null,
			joined_at: '2026-08-01 00:00:00.000'
		}
	];

	it('blocks a direct send once the mutual follow is broken', async () => {
		queue_rows(
			participant,
			[
				{
					id: 'conversation_1',
					kind: 'direct',
					title: null,
					direct_key: 'user_a:user_b',
					created_by: 'user_a'
				}
			],
			[] // mutual follow probe comes back empty
		);

		const failure = await assert_can_send('conversation_1', 'user_a').catch((error) => error);

		expect(failure).toBeInstanceOf(pigeon_error);
		expect(failure.body.error).toBe('not_mutual_follow');
	});

	it('allows a direct send while the follow is still mutual', async () => {
		queue_rows(
			participant,
			[
				{
					id: 'conversation_1',
					kind: 'direct',
					title: null,
					direct_key: 'user_a:user_b',
					created_by: 'user_a'
				}
			],
			[{ 1: 1 }]
		);

		expect((await assert_can_send('conversation_1', 'user_a')).user_id).toBe('user_a');
	});

	it('never probes mutual follows for a group', async () => {
		queue_rows(participant, [
			{ id: 'conversation_1', kind: 'group', title: 'Trip', direct_key: null, created_by: 'user_a' }
		]);

		await assert_can_send('conversation_1', 'user_a');

		// Two reads only: the participant row and the conversation row.
		expect(executed).toHaveLength(2);
	});
});

describe('release_pigeon', () => {
	const participant = [
		{
			conversation_id: 'conversation_1',
			user_id: 'user_a',
			role: 'owner',
			last_read_at: null,
			joined_at: '2026-08-01 00:00:00.000'
		}
	];

	// A group conversation, so assert_can_send skips the mutual-follow probe and
	// the queued reads below stay readable.
	function queue_successful_release() {
		queue_rows(
			participant,
			[
				{ id: 'conversation_1', kind: 'group', title: null, direct_key: null, created_by: 'user_a' }
			],
			[{ verified: 0 }],
			[{ in_flight: 0, next_available_at: null }],
			[phnom_penh],
			[{ user_id: 'user_a' }, { user_id: 'user_b' }],
			[{ id: 'user_b', ...tokyo }],
			[{ user_a_id: 'user_a', user_b_id: 'user_b', distance_km: 4350 }]
		);
	}

	it('writes the whole flight in exactly one batch', async () => {
		queue_successful_release();

		await release_pigeon('conversation_1', 'user_a', 'Hello Tokyo');

		expect(mock_batch).toHaveBeenCalledTimes(1);

		const statements = batched[0].map((statement) => statement.sql);
		expect(statements.filter((sql) => sql.includes('INSERT INTO pigeon_flight'))).toHaveLength(1);
		expect(statements.filter((sql) => sql.includes('INSERT INTO message '))).toHaveLength(1);
		expect(statements.filter((sql) => sql.includes('INSERT INTO message_delivery'))).toHaveLength(
			1
		);
	});

	it('stores fuzzed coordinates in route_json, never the exact ones', async () => {
		queue_successful_release();

		await release_pigeon('conversation_1', 'user_a', 'Hello Tokyo');

		const flight_insert = batched[0].find((statement) =>
			statement.sql.includes('INSERT INTO pigeon_flight')
		);
		const route = JSON.parse(flight_insert?.args[3] as string);

		// This is the assertion that keeps home addresses out of the database rows
		// a client can ever be shown.
		expect(route[0].from.lat).not.toBe(phnom_penh.home_lat);
		expect(route[0].to.lat).not.toBe(tokyo.home_lat);
		// Still the right place, just rounded to about a kilometre.
		expect(route[0].from.lat).toBeCloseTo(phnom_penh.home_lat, 1);
		expect(route[0].to.lng).toBeCloseTo(tokyo.home_lng, 1);
	});

	it('plans the round trip so the bird is busy longer than the delivery takes', async () => {
		queue_successful_release();

		const result = await release_pigeon('conversation_1', 'user_a', 'Hello Tokyo');

		const deliver_at = epoch_from_sql_timestamp(result.deliveries[0].deliver_at);
		const available_at = epoch_from_sql_timestamp(result.flight.available_at);
		const departed_at = epoch_from_sql_timestamp(result.flight.departed_at);

		expect(deliver_at).toBeGreaterThan(departed_at);
		expect(available_at).toBeGreaterThan(deliver_at);

		// Phnom Penh to Tokyo at 80km/h is a little over two days out.
		const hours_out = (deliver_at - departed_at) / 3_600_000;
		expect(hours_out).toBeGreaterThan(50);
		expect(hours_out).toBeLessThan(58);
	});

	it('marks the sender as having read their own message', async () => {
		queue_successful_release();

		await release_pigeon('conversation_1', 'user_a', 'Hello Tokyo');

		const read_update = batched[0].find((statement) => statement.sql.includes('SET last_read_at'));

		expect(read_update).toBeDefined();
	});

	it('refuses an empty message with no attachments', async () => {
		const failure = await release_pigeon('conversation_1', 'user_a', '   ').catch((error) => error);

		expect(failure).toBeInstanceOf(pigeon_error);
		expect(failure.body.error).toBe('empty_message');
		// Rejected before any query, so nothing was read or written.
		expect(mock_execute).not.toHaveBeenCalled();
	});

	it('refuses a message over the length limit', async () => {
		const failure = await release_pigeon('conversation_1', 'user_a', 'x'.repeat(2001)).catch(
			(error) => error
		);

		expect(failure.body.error).toBe('message_too_long');
	});

	it('refuses when the sender has no home loft', async () => {
		queue_rows(
			participant,
			[
				{ id: 'conversation_1', kind: 'group', title: null, direct_key: null, created_by: 'user_a' }
			],
			[{ verified: 0 }],
			[{ in_flight: 0, next_available_at: null }],
			[] // no coordinates on file
		);

		const failure = await release_pigeon('conversation_1', 'user_a', 'Hello').catch(
			(error) => error
		);

		expect(failure.body.error).toBe('sender_home_unset');
	});

	it('refuses when a recipient has no home loft, naming them', async () => {
		queue_rows(
			participant,
			[
				{ id: 'conversation_1', kind: 'group', title: null, direct_key: null, created_by: 'user_a' }
			],
			[{ verified: 0 }],
			[{ in_flight: 0, next_available_at: null }],
			[phnom_penh],
			[{ user_id: 'user_a' }, { user_id: 'user_b' }],
			[] // user_b has no coordinates
		);

		const failure = await release_pigeon('conversation_1', 'user_a', 'Hello').catch(
			(error) => error
		);

		expect(failure.body.error).toBe('recipient_home_unset');
		expect(failure.body.user_ids).toEqual(['user_b']);
	});

	it('refuses when the coop is empty', async () => {
		queue_rows(
			participant,
			[
				{ id: 'conversation_1', kind: 'group', title: null, direct_key: null, created_by: 'user_a' }
			],
			[{ verified: 0 }],
			[{ in_flight: 10, next_available_at: '2026-08-20 00:00:00.000' }]
		);

		const failure = await release_pigeon('conversation_1', 'user_a', 'Hello').catch(
			(error) => error
		);

		expect(failure.body.error).toBe('no_pigeon_available');
		expect(mock_batch).not.toHaveBeenCalled();
	});
});

describe('recall_pigeon', () => {
	const route = [
		{
			from: { lat: 11.5564, lng: 104.9282 },
			to: { lat: 35.6762, lng: 139.6503 },
			recipient_id: 'user_b',
			distance_km: 4350
		},
		{
			from: { lat: 35.6762, lng: 139.6503 },
			to: { lat: 11.5564, lng: 104.9282 },
			recipient_id: null,
			distance_km: 4350
		}
	];

	function flight_row(departed_ms: number, status = 'in_flight') {
		return {
			id: 'flight_1',
			sender_id: 'user_a',
			route_json: JSON.stringify(route),
			departed_at: sql_timestamp_from_epoch(departed_ms),
			available_at: sql_timestamp_from_epoch(departed_ms + (8700 / 80) * 3_600_000),
			status
		};
	}

	it('cancels only the deliveries still in the air', async () => {
		// Departed one hour ago: nowhere near Tokyo yet.
		queue_rows([flight_row(Date.now() - 3_600_000)]);

		const result = await recall_pigeon('flight_1', 'user_a');

		expect(result.cancelled_recipient_ids).toEqual(['user_b']);

		const cancel_statement = batched[0][0];
		expect(cancel_statement.sql).toContain('SET cancelled_at');
		// Anything already landed must be left alone.
		expect(cancel_statement.sql).toContain('deliver_at > ?');
	});

	it('brings the bird home sooner than finishing the route would', async () => {
		const departed_ms = Date.now() - 3_600_000;
		queue_rows([flight_row(departed_ms)]);

		const result = await recall_pigeon('flight_1', 'user_a');
		const original_available = departed_ms + (8700 / 80) * 3_600_000;

		expect(epoch_from_sql_timestamp(result.available_at)).toBeLessThan(original_available);
	});

	it('refuses to recall someone elses pigeon', async () => {
		queue_rows([flight_row(Date.now() - 3_600_000)]);

		const failure = await recall_pigeon('flight_1', 'user_c').catch((error) => error);

		expect(failure.body.error).toBe('not_your_pigeon');
	});

	it('refuses once every recipient already has the message', async () => {
		// Departed long enough ago that Tokyo has been reached.
		queue_rows([flight_row(Date.now() - 60 * 3_600_000)]);

		const failure = await recall_pigeon('flight_1', 'user_a').catch((error) => error);

		expect(failure.body.error).toBe('nothing_to_recall');
		expect(mock_batch).not.toHaveBeenCalled();
	});

	it('refuses a flight that was already recalled', async () => {
		queue_rows([flight_row(Date.now() - 3_600_000, 'recalled')]);

		const failure = await recall_pigeon('flight_1', 'user_a').catch((error) => error);

		expect(failure.body.error).toBe('nothing_to_recall');
	});
});

describe('get_thread', () => {
	const participant = [
		{
			conversation_id: 'conversation_1',
			user_id: 'user_a',
			role: 'member',
			last_read_at: null,
			joined_at: '2026-08-01 00:00:00.000'
		}
	];

	it('gates received messages on deliver_at having passed', async () => {
		queue_rows(participant, [], [], []);

		await get_thread('conversation_1', 'user_a');

		// The delivery mechanism, in one predicate.
		expect(all_sql()).toContain('md.deliver_at <= ?');
	});

	it('shows the senders own messages from the moment they depart', async () => {
		queue_rows(participant, [], [], []);

		await get_thread('conversation_1', 'user_a');

		const own_query = executed.find((call) => call.sql.includes('JOIN pigeon_flight'));
		expect(own_query?.sql).not.toContain('deliver_at');
	});

	it('returns own messages carrying their flight and received ones without', async () => {
		queue_rows(
			participant,
			[
				{
					id: 'message_in',
					sender_id: 'user_b',
					body: 'Landed',
					attachment_count: 0,
					visible_at: '2026-08-10 00:00:00.000'
				}
			],
			[
				{
					id: 'message_out',
					sender_id: 'user_a',
					body: 'Still flying',
					attachment_count: 0,
					visible_at: '2026-08-12 00:00:00.000',
					flight_id: 'flight_1',
					route_json: '[]',
					total_distance_km: 4350,
					flight_departed_at: '2026-08-12 00:00:00.000',
					available_at: '2026-08-16 00:00:00.000',
					status: 'in_flight',
					recalled_at: null
				}
			],
			[],
			[]
		);

		const { messages } = await get_thread('conversation_1', 'user_a');

		// Oldest first, and only the sender's own message carries flight detail.
		expect(messages.map((message) => message.id)).toEqual(['message_in', 'message_out']);
		expect(messages[0].flight).toBeNull();
		expect(messages[1].flight?.id).toBe('flight_1');
	});
});

describe('unread and arrivals', () => {
	it('counts unread conversations rather than unread messages', async () => {
		queue_rows([{ unread_conversations: 2 }]);

		expect(await count_unread_conversations('user_a')).toBe(2);
		expect(all_sql()).toContain('COUNT(DISTINCT m.conversation_id)');
	});

	it('finds the next arrival strictly in the future', async () => {
		queue_rows([{ next_arrival_at: '2026-08-19 04:00:00.000' }]);

		expect(await get_next_arrival_at('user_a')).toBe('2026-08-19 04:00:00.000');
		expect(all_sql()).toContain('md.deliver_at > ?');
	});

	it('returns null when nothing is on its way', async () => {
		queue_rows([{ next_arrival_at: null }]);

		expect(await get_next_arrival_at('user_a')).toBeNull();
	});
});

describe('mark_conversation_read', () => {
	it('never moves the read marker backwards', async () => {
		await mark_conversation_read('conversation_1', 'user_a');

		expect(executed[0].sql).toContain('last_read_at IS NULL OR last_read_at < ?');
	});

	it('clamps a marker from the future back to now', async () => {
		await mark_conversation_read('conversation_1', 'user_a', '2099-01-01 00:00:00.000');

		expect(executed[0].args[0]).not.toBe('2099-01-01 00:00:00.000');
	});

	it('honours an explicit marker in the past', async () => {
		await mark_conversation_read('conversation_1', 'user_a', '2026-01-01 00:00:00.000');

		expect(executed[0].args[0]).toBe('2026-01-01 00:00:00.000');
	});
});
