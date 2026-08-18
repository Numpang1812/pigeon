import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

/**
 * Loads the signed-in user's home loft.
 *
 * These coordinates are exact rather than fuzzed: a user's own position is not
 * a secret from them. Everyone else only ever sees a distance, or a position
 * snapped to a ~1km grid.
 *
 * Updating the loft goes through POST /api/pigeon/home, the same endpoint the
 * signup gate uses, so the write and its cache invalidation live in one place.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.id) {
		return { home: null };
	}

	const result = await db.execute({
		sql: 'SELECT home_lat, home_lng, home_accuracy_m, home_set_at FROM user WHERE id = ? LIMIT 1',
		args: [locals.user.id]
	});

	const row = result.rows[0];
	if (!row || row.home_lat === null || row.home_lng === null) {
		return { home: null };
	}

	return {
		home: {
			lat: Number(row.home_lat),
			lng: Number(row.home_lng),
			accuracy_m: row.home_accuracy_m === null ? null : Number(row.home_accuracy_m),
			set_at: (row.home_set_at as string | null) ?? null
		}
	};
};
