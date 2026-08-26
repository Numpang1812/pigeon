import { json, type RequestHandler } from '@sveltejs/kit';
import { require_user, to_error_response } from '$lib/server/pigeon-api';
import { get_events_in_bounds, type WeatherEvent } from '$lib/pigeon/weather-events';

function parse_bound(value: string | null, min: number, max: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return 0;
	return Math.min(Math.max(parsed, min), max);
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, url }) => {
	try {
		await require_user(request);

		const bounds = {
			min_lat: parse_bound(url.searchParams.get('min_lat'), -90, 90),
			max_lat: parse_bound(url.searchParams.get('max_lat'), -90, 90),
			min_lng: parse_bound(url.searchParams.get('min_lng'), -180, 180),
			max_lng: parse_bound(url.searchParams.get('max_lng'), -180, 180)
		};
		if (bounds.max_lat < bounds.min_lat) bounds.max_lat = bounds.min_lat;
		if (bounds.max_lng < bounds.min_lng) bounds.max_lng = bounds.min_lng;

		const events = get_events_in_bounds(bounds);

		// Backwards-compatible cells representation for any consumer
		const cells = events.map((ev) => ({
			id: ev.id,
			name: ev.name,
			lat: ev.center.lat,
			lng: ev.center.lng,
			condition: ev.condition,
			multiplier: ev.multiplier,
			radius_m: ev.radius_m,
			radius_km: ev.radius_km
		}));

		return json({
			events,
			cells,
			sampled: events.length,
			resolved: events.length,
			server_now: Date.now()
		});
	} catch (error) {
		return to_error_response(error, 'Failed to read weather');
	}
};
