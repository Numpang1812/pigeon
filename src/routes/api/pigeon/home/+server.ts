import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { is_valid_coords } from '$lib/pigeon/flight';
import { PigeonError, set_home_coords, get_home_coords } from '$lib/server/pigeon-post';
import { pigeon_home_limiter } from '$lib/server/rate-limiter';

/**
 * Save the sender's home loft.
 *
 * Coordinates arrive from navigator.geolocation, so they are entirely
 * client-controlled and validated here rather than trusted. Saving them also
 * clears every cached distance involving this user — see set_home_coords.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const rate_limit = pigeon_home_limiter.check(session.user.id, 5, 60_000);
		if (!rate_limit.allowed) {
			return json(
				{ error: 'too_many_requests', retry_after_ms: rate_limit.retry_after_ms },
				{ status: 429 }
			);
		}

		const payload = await request.json().catch(() => null);
		const lat = Number((payload as { lat?: unknown } | null)?.lat);
		const lng = Number((payload as { lng?: unknown } | null)?.lng);
		const raw_accuracy = Number((payload as { accuracy_m?: unknown } | null)?.accuracy_m);

		if (!is_valid_coords({ lat, lng })) {
			return json({ error: 'invalid_coords' }, { status: 400 });
		}

		// A hard 0,0 is the classic "no fix" sentinel rather than a real position
		// in the Gulf of Guinea, so treat it as a failed lookup.
		if (lat === 0 && lng === 0) {
			return json({ error: 'invalid_coords' }, { status: 400 });
		}

		const accuracy_m = Number.isFinite(raw_accuracy) && raw_accuracy > 0 ? raw_accuracy : null;

		await set_home_coords(session.user.id, { lat, lng }, accuracy_m);

		return json({ success: true });
	} catch (error) {
		if (error instanceof PigeonError) {
			return json(error.body, { status: error.status });
		}
		console.error('[PIGEON API] Failed to save home loft:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

/** Whether the signed-in user has a home loft, and its accuracy if so. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const coords = await get_home_coords(session.user.id);

		// The user's own coordinates are not a secret from them, so these are exact.
		return json({ has_home: coords !== null, home: coords });
	} catch (error) {
		console.error('[PIGEON API] Failed to read home loft:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
