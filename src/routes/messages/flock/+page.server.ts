import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { get_flock_state, now_sql_timestamp } from '$lib/server/pigeon-post';

/**
 * The loft: every bird currently out, and where it is.
 *
 * route_json already holds map-fuzzed coordinates, so it can be handed straight
 * to the map component.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user_id = locals.user?.id;
	if (!user_id) throw redirect(303, '/');

	const now = now_sql_timestamp();

	const [flock, flights] = await Promise.all([
		get_flock_state(user_id),
		db.execute({
			sql: `SELECT f.id, f.conversation_id, f.route_json, f.total_distance_km,
			             f.departed_at, f.available_at, f.status, m.body
			      FROM pigeon_flight f
			      LEFT JOIN message m ON m.flight_id = f.id
			      WHERE f.sender_id = ? AND f.available_at > ?
			      ORDER BY f.available_at ASC`,
			args: [user_id, now]
		})
	]);

	return {
		flock,
		server_now: Date.now(),
		flights: flights.rows.map((row) => ({
			id: row.id as string,
			conversation_id: row.conversation_id as string,
			preview: ((row.body as string | null) ?? '').slice(0, 120),
			route: JSON.parse(row.route_json as string),
			total_distance_km: Number(row.total_distance_km ?? 0),
			departed_at: row.departed_at as string,
			available_at: row.available_at as string,
			status: row.status as string
		}))
	};
};
