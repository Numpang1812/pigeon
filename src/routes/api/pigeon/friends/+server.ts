import { json, type RequestHandler } from '@sveltejs/kit';
import { flight_ms_for_km } from '$lib/pigeon/flight';
import { get_mutual_follows, get_pair_distances_km } from '$lib/server/pigeon-post';
import { require_user, to_error_response } from '$lib/server/pigeon-api';

/**
 * Friends you can send a pigeon to: mutual followers who have a home loft.
 *
 * Each friend carries the distance and flight time, so the cost of a send is
 * visible before a bird is spent. Coordinates are never included — only the
 * derived distance.
 *
 * Deliberately not /api/users/following, which returns one-directional follows
 * and is already relied on for close-friends post audiences.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await require_user(request);

		const search = url.searchParams.get('q') ?? undefined;
		const raw_limit = Number(url.searchParams.get('limit'));
		const limit = Number.isFinite(raw_limit) && raw_limit > 0 ? raw_limit : 50;

		const friends = await get_mutual_follows(user.id, { search, limit });

		if (friends.length === 0) return json({ friends: [] });

		const distances = await get_pair_distances_km(
			user.id,
			friends.map((friend) => friend.id)
		);

		return json({
			friends: friends.map((friend) => {
				const distance_km = distances.get(friend.id) ?? null;

				return {
					...friend,
					distance_km,
					flight_ms: distance_km === null ? null : flight_ms_for_km(distance_km)
				};
			})
		});
	} catch (error) {
		return to_error_response(error, 'Failed to list friends');
	}
};
