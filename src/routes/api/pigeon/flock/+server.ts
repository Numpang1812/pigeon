import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { get_flock_state, now_sql_timestamp } from '$lib/server/pigeon-post';
import { require_user, to_error_response } from '$lib/server/pigeon-api';

/**
 * The loft: how many birds are out, when the next one lands, and where each is.
 *
 * route_json already holds fuzzed coordinates, so it is safe to hand straight
 * back to the sender for the map.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await require_user(request);
		const now = now_sql_timestamp();

		const [flock, flights] = await Promise.all([
			get_flock_state(user.id),
			db.execute({
				sql: `SELECT f.id, f.conversation_id, f.route_json, f.total_distance_km,
				             f.departed_at, f.available_at, f.status,
				             m.id AS message_id, m.body
				      FROM pigeon_flight f
				      LEFT JOIN message m ON m.flight_id = f.id
				      WHERE f.sender_id = ? AND f.available_at > ?
				      ORDER BY f.available_at ASC`,
				args: [user.id, now]
			})
		]);

		return json({
			...flock,
			server_now: Date.now(),
			flights: flights.rows.map((row) => ({
				id: row.id as string,
				conversation_id: row.conversation_id as string,
				message_id: (row.message_id as string | null) ?? null,
				preview: ((row.body as string | null) ?? '').slice(0, 120),
				route: JSON.parse(row.route_json as string),
				total_distance_km: Number(row.total_distance_km ?? 0),
				departed_at: row.departed_at as string,
				available_at: row.available_at as string,
				status: row.status as string
			}))
		});
	} catch (error) {
		return to_error_response(error, 'Failed to read flock');
	}
};
