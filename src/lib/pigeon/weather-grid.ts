/**
 * Viewport sampling grid for the weather overlay.
 *
 * The step adapts in BOTH directions so every zoom level gets a similar
 * sample count: city views use the native 0.25 degree resolution, world
 * views coarsen to a handful of points. Samples are anchored to the lattice
 * of their own step, which keeps cache keys stable while panning.
 */

export const GRID_STEP_DEG = 0.25;

/** Sample budget per viewport request; also the Open-Meteo batch size guard. */
export const MAX_SAMPLES = 80;

export type ViewportBounds = {
	min_lat: number;
	max_lat: number;
	min_lng: number;
	max_lng: number;
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Grid step for a viewport: roughly span/8, snapped UP to a multiple of the
 * native 0.25 degree resolution, then widened until the point count fits the
 * budget. Never finer than 0.25 degrees — that is all the data there is.
 */
export function viewport_step(bounds: ViewportBounds): number {
	const lat_span = Math.max(0, bounds.max_lat - bounds.min_lat);
	const lng_span = clamp(bounds.max_lng - bounds.min_lng, 0, 360);
	const span = Math.max(lat_span, lng_span);

	const coarse_degrees = Math.ceil(span / 8 / GRID_STEP_DEG) * GRID_STEP_DEG;
	let step = Math.max(coarse_degrees, GRID_STEP_DEG);

	while (count_points(bounds, step) > MAX_SAMPLES) {
		step += GRID_STEP_DEG;
	}

	return step;
}

function count_points(bounds: ViewportBounds, step: number): number {
	return viewport_sample_points_with_step(bounds, step).length;
}

/** Cell-anchored sample points covering the bounds at the given step. */
function viewport_sample_points_with_step(
	bounds: ViewportBounds,
	step: number
): { lat: number; lng: number }[] {
	const points: { lat: number; lng: number }[] = [];
	const epsilon = step / 1e6;

	// Anchor to the lattice so panning by less than one cell reuses keys.
	let first_lat = Math.ceil(bounds.min_lat / step) * step;
	let first_lng = Math.ceil(bounds.min_lng / step) * step;
	if (!Number.isFinite(first_lat)) first_lat = bounds.min_lat;
	if (!Number.isFinite(first_lng)) first_lng = bounds.min_lng;

	for (let lat = first_lat; lat <= bounds.max_lat + epsilon; lat += step) {
		for (let lng = first_lng; lng <= bounds.max_lng + epsilon; lng += step) {
			points.push({ lat, lng });
		}
	}

	return points;
}

/**
 * Sample points covering the whole viewport, always at least one.
 *
 * A city-level viewport that contains no lattice line still gets its corner
 * point, so the response is never empty just because the map is zoomed in.
 */
export function viewport_sample_points(
	bounds: ViewportBounds
): { lat: number; lng: number }[] {
	const points = viewport_sample_points_with_step(bounds, viewport_step(bounds));
	if (points.length > 0) return points;
	return [{ lat: bounds.min_lat, lng: bounds.min_lng }];
}
