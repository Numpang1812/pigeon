/**
 * Pigeon Flight Model
 *
 * Pure geometry and timing for the E-Pigeon. No database, no DOM — shared by
 * the server (computing delivery timestamps) and the client (animating a bird
 * across the map), so both sides always agree on where a pigeon is.
 *
 * A pigeon flies in a straight line at a constant speed. Distance is measured
 * on the sphere (haversine); the path is drawn straight in lat/lng, which is
 * also straight on the equirectangular projection used by the map.
 */

export type Coords = {
	lat: number;
	lng: number;
};

// ==========================================
// Constants
// ==========================================

/** Homing pigeon cruise speed. This constant is the entire feature — see flight.test.ts. */
export const pigeon_speed_kmh = 80;

export const earth_radius_km = 6371;

export const flock_size_normal = 10;
export const flock_size_verified = 20;

/** Grid size that map positions are snapped to, so exact coordinates never reach another user. */
export const map_fuzz_km = 1;

const ms_per_hour = 3_600_000;
const km_per_degree_lat = 110.574;
const km_per_degree_lng_equator = 111.32;

// ==========================================
// Angles and longitude wrapping
// ==========================================

function to_radians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/** Wrap a longitude into [-180, 180). */
export function wrap_lng(lng: number): number {
	return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Longitude delta taking the shorter way round the globe.
 *
 * Without this a Tokyo (139.7E) to Honolulu (157.9W) flight would cross the
 * entire map westward instead of hopping the antimeridian.
 */
export function shorter_lng_delta(from_lng: number, to_lng: number): number {
	let delta = to_lng - from_lng;
	while (delta > 180) delta -= 360;
	while (delta < -180) delta += 360;
	return delta;
}

// ==========================================
// Distance
// ==========================================

export function haversine_km(a: Coords, b: Coords): number {
	const lat_1 = to_radians(a.lat);
	const lat_2 = to_radians(b.lat);
	const delta_lat = to_radians(b.lat - a.lat);
	const delta_lng = to_radians(shorter_lng_delta(a.lng, b.lng));

	const chord =
		Math.sin(delta_lat / 2) * Math.sin(delta_lat / 2) +
		Math.cos(lat_1) * Math.cos(lat_2) * Math.sin(delta_lng / 2) * Math.sin(delta_lng / 2);

	return 2 * earth_radius_km * Math.asin(Math.min(1, Math.sqrt(chord)));
}

/** Flight duration in milliseconds for a given distance. */
export function flight_ms_for_km(distance_km: number): number {
	return (distance_km / pigeon_speed_kmh) * ms_per_hour;
}

// ==========================================
// Route planning
// ==========================================

export type RouteRecipient = {
	user_id: string;
	coords: Coords;
};

export type RouteLeg = {
	from: Coords;
	to: Coords;
	/** The recipient this leg delivers to, or null for the final leg home. */
	recipient_id: string | null;
	distance_km: number;
};

/**
 * Plan the route for one bird: visit every recipient nearest-first, then fly home.
 *
 * Greedy nearest-neighbour is deliberate. Groups cap at 20 members, so the
 * optimal tour is not worth solving, and "the pigeon goes to whoever is
 * closest next" is the behaviour a reader expects anyway.
 */
export function plan_route(origin: Coords, recipients: RouteRecipient[]): RouteLeg[] {
	const remaining = [...recipients];
	const legs: RouteLeg[] = [];
	let current = origin;

	while (remaining.length > 0) {
		let nearest_index = 0;
		let nearest_km = haversine_km(current, remaining[0].coords);

		for (let index = 1; index < remaining.length; index += 1) {
			const candidate_km = haversine_km(current, remaining[index].coords);
			if (candidate_km < nearest_km) {
				nearest_km = candidate_km;
				nearest_index = index;
			}
		}

		const [next] = remaining.splice(nearest_index, 1);
		legs.push({
			from: current,
			to: next.coords,
			recipient_id: next.user_id,
			distance_km: nearest_km
		});
		current = next.coords;
	}

	legs.push({
		from: current,
		to: origin,
		recipient_id: null,
		distance_km: haversine_km(current, origin)
	});

	return legs;
}

export function route_total_km(route: RouteLeg[]): number {
	return route.reduce((total, leg) => total + leg.distance_km, 0);
}

/** When the bird is back in the loft and rejoins the flock. */
export function available_at_for(route: RouteLeg[], departed_at: number): number {
	return departed_at + flight_ms_for_km(route_total_km(route));
}

// ==========================================
// Delivery schedule
// ==========================================

export type DeliveryStop = {
	recipient_id: string;
	leg_order: number;
	/** Total distance flown to reach this recipient, not the length of the final leg. */
	distance_km: number;
	deliver_at: number;
};

export function delivery_schedule(route: RouteLeg[], departed_at: number): DeliveryStop[] {
	const schedule: DeliveryStop[] = [];
	let cumulative_km = 0;
	let leg_order = 0;

	for (const leg of route) {
		cumulative_km += leg.distance_km;

		if (leg.recipient_id === null) continue;

		schedule.push({
			recipient_id: leg.recipient_id,
			leg_order,
			distance_km: cumulative_km,
			deliver_at: departed_at + flight_ms_for_km(cumulative_km)
		});
		leg_order += 1;
	}

	return schedule;
}

// ==========================================
// Position in flight
// ==========================================

/** Straight-line interpolation along a leg, taking the short way round the globe. */
export function interpolate_leg(from: Coords, to: Coords, fraction: number): Coords {
	return {
		lat: from.lat + (to.lat - from.lat) * fraction,
		lng: wrap_lng(from.lng + shorter_lng_delta(from.lng, to.lng) * fraction)
	};
}

export type FlightPosition = {
	coords: Coords;
	leg_index: number;
	fraction: number;
};

export function position_at(route: RouteLeg[], departed_at: number, now: number): FlightPosition {
	if (route.length === 0) {
		return { coords: { lat: 0, lng: 0 }, leg_index: 0, fraction: 1 };
	}

	const elapsed_hours = Math.max(0, (now - departed_at) / ms_per_hour);
	const flown_km = elapsed_hours * pigeon_speed_kmh;
	const total_km = route_total_km(route);

	if (flown_km >= total_km) {
		const final_leg = route[route.length - 1];
		return { coords: { ...final_leg.to }, leg_index: route.length - 1, fraction: 1 };
	}

	let remaining_km = flown_km;

	for (let index = 0; index < route.length; index += 1) {
		const leg = route[index];

		if (remaining_km <= leg.distance_km) {
			// A zero-length leg (identical coordinates) counts as instantly complete.
			const fraction = leg.distance_km === 0 ? 1 : remaining_km / leg.distance_km;
			return {
				coords: interpolate_leg(leg.from, leg.to, fraction),
				leg_index: index,
				fraction
			};
		}

		remaining_km -= leg.distance_km;
	}

	const final_leg = route[route.length - 1];
	return { coords: { ...final_leg.to }, leg_index: route.length - 1, fraction: 1 };
}

/** Fraction of the whole round trip completed, for a progress readout. */
export function progress_at(route: RouteLeg[], departed_at: number, now: number): number {
	const total_km = route_total_km(route);
	if (total_km === 0) return 1;

	const flown_km = Math.max(0, (now - departed_at) / ms_per_hour) * pigeon_speed_kmh;
	return Math.min(1, flown_km / total_km);
}

// ==========================================
// Recall
// ==========================================

export type RecallPlan = {
	return_distance_km: number;
	available_at: number;
	cancelled_recipient_ids: string[];
};

/**
 * Turn the bird around from wherever it currently is and send it straight home.
 *
 * Recipients already reached keep their message — you cannot unsend what has
 * arrived. Everyone still downstream on the route is cancelled.
 */
export function plan_recall(
	route: RouteLeg[],
	departed_at: number,
	recalled_at: number,
	origin: Coords
): RecallPlan {
	const current = position_at(route, departed_at, recalled_at);
	const return_distance_km = haversine_km(current.coords, origin);

	const cancelled_recipient_ids = delivery_schedule(route, departed_at)
		.filter((stop) => stop.deliver_at > recalled_at)
		.map((stop) => stop.recipient_id);

	return {
		return_distance_km,
		available_at: recalled_at + flight_ms_for_km(return_distance_km),
		cancelled_recipient_ids
	};
}

// ==========================================
// Map privacy
// ==========================================

/**
 * Snap coordinates to a ~1km grid for display.
 *
 * Grid snapping, never a random offset: a random jitter regenerated on each
 * request would let a viewer average many samples back to the true position.
 * A snapped value never varies, so there is nothing to average.
 */
export function fuzz_for_map(coords: Coords): Coords {
	const step_lat = map_fuzz_km / km_per_degree_lat;
	const snapped_lat = Math.round(coords.lat / step_lat) * step_lat;

	// The longitude step is derived from the SNAPPED latitude, not the raw one.
	// Deriving it from the raw value would shift the longitude grid whenever
	// latitude moved by metres, so the function would not be idempotent and
	// neighbouring positions would land on different cells.
	const cos_lat = Math.abs(Math.cos(to_radians(snapped_lat)));
	// Clamp near the poles, where a degree of longitude collapses to nothing.
	const step_lng = map_fuzz_km / (km_per_degree_lng_equator * Math.max(cos_lat, 0.01));

	return {
		lat: snapped_lat,
		lng: wrap_lng(Math.round(coords.lng / step_lng) * step_lng)
	};
}

// ==========================================
// Projection (equirectangular / plate carree)
// ==========================================

export function project(coords: Coords, width: number, height: number): { x: number; y: number } {
	return {
		x: ((wrap_lng(coords.lng) + 180) / 360) * width,
		y: ((90 - coords.lat) / 180) * height
	};
}

export type Bounds = {
	min_lat: number;
	max_lat: number;
	min_lng: number;
	max_lng: number;
};

/** Bounding box of a route, so the map can zoom to fit instead of showing the whole world. */
export function route_bounds(route: RouteLeg[]): Bounds {
	const points = route.flatMap((leg) => [leg.from, leg.to]);

	if (points.length === 0) {
		return { min_lat: -90, max_lat: 90, min_lng: -180, max_lng: 180 };
	}

	return {
		min_lat: Math.min(...points.map((point) => point.lat)),
		max_lat: Math.max(...points.map((point) => point.lat)),
		min_lng: Math.min(...points.map((point) => point.lng)),
		max_lng: Math.max(...points.map((point) => point.lng))
	};
}

// ==========================================
// Flock
// ==========================================

export function flock_size_for(verified: boolean): number {
	return verified ? flock_size_verified : flock_size_normal;
}

// ==========================================
// Validation
// ==========================================

export function is_valid_coords(value: unknown): value is Coords {
	if (!value || typeof value !== 'object') return false;

	const candidate = value as { lat?: unknown; lng?: unknown };

	return (
		typeof candidate.lat === 'number' &&
		typeof candidate.lng === 'number' &&
		Number.isFinite(candidate.lat) &&
		Number.isFinite(candidate.lng) &&
		candidate.lat >= -90 &&
		candidate.lat <= 90 &&
		candidate.lng >= -180 &&
		candidate.lng <= 180
	);
}
