import { describe, it, expect } from 'vitest';
import {
	available_at_for,
	delivery_schedule,
	flight_ms_for_km,
	flock_size_for,
	fuzz_for_map,
	haversine_km,
	interpolate_leg,
	is_valid_coords,
	pigeon_speed_kmh,
	plan_recall,
	plan_route,
	position_at,
	progress_at,
	project,
	route_bounds,
	route_total_km,
	shorter_lng_delta,
	wrap_lng,
	type Coords
} from './flight';

// Reference points used throughout. Real coordinates, so the distance
// assertions below can be checked against any mapping tool.
const phnom_penh: Coords = { lat: 11.5564, lng: 104.9282 };
const bangkok: Coords = { lat: 13.7563, lng: 100.5018 };
const tokyo: Coords = { lat: 35.6762, lng: 139.6503 };
const london: Coords = { lat: 51.5074, lng: -0.1278 };
const new_york: Coords = { lat: 40.7128, lng: -74.006 };
const honolulu: Coords = { lat: 21.3069, lng: -157.8583 };

describe('pigeon_speed_kmh', () => {
	it('is 80 km/h', () => {
		// The delay IS the product. A dev-testing value must never ship.
		expect(pigeon_speed_kmh).toBe(80);
	});
});

describe('haversine_km', () => {
	it('measures Phnom Penh to Bangkok at about 530km', () => {
		expect(haversine_km(phnom_penh, bangkok)).toBeGreaterThan(510);
		expect(haversine_km(phnom_penh, bangkok)).toBeLessThan(560);
	});

	it('measures Phnom Penh to Tokyo at about 4350km', () => {
		expect(haversine_km(phnom_penh, tokyo)).toBeGreaterThan(4200);
		expect(haversine_km(phnom_penh, tokyo)).toBeLessThan(4500);
	});

	it('measures London to New York at about 5570km', () => {
		expect(haversine_km(london, new_york)).toBeGreaterThan(5500);
		expect(haversine_km(london, new_york)).toBeLessThan(5620);
	});

	it('is symmetric', () => {
		expect(haversine_km(london, tokyo)).toBeCloseTo(haversine_km(tokyo, london), 6);
	});

	it('returns zero for identical coordinates', () => {
		expect(haversine_km(phnom_penh, { ...phnom_penh })).toBe(0);
	});

	it('measures antipodal points as half the circumference', () => {
		expect(haversine_km({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(20015, 0);
	});
});

describe('antimeridian handling', () => {
	it('takes the short way from Tokyo to Honolulu', () => {
		// The long way round would be roughly 33,800km.
		expect(haversine_km(tokyo, honolulu)).toBeGreaterThan(6000);
		expect(haversine_km(tokyo, honolulu)).toBeLessThan(6600);
	});

	it('picks the eastward delta across the date line', () => {
		expect(shorter_lng_delta(139.6503, -157.8583)).toBeCloseTo(62.4914, 3);
	});

	it('interpolates a Tokyo to Honolulu flight across the Pacific, not over Africa', () => {
		const midpoint = interpolate_leg(tokyo, honolulu, 0.5);
		// Crossing the date line keeps |lng| near 180. Going the wrong way
		// would put the midpoint near -9 degrees, over west Africa.
		expect(Math.abs(midpoint.lng)).toBeGreaterThan(170);
	});

	it('wraps longitudes into [-180, 180)', () => {
		expect(wrap_lng(200)).toBeCloseTo(-160, 6);
		expect(wrap_lng(-200)).toBeCloseTo(160, 6);
		expect(wrap_lng(104.9282)).toBeCloseTo(104.9282, 6);
	});
});

describe('plan_route', () => {
	it('visits the nearest recipient first', () => {
		const route = plan_route(phnom_penh, [
			{ user_id: 'tokyo_user', coords: tokyo },
			{ user_id: 'bangkok_user', coords: bangkok }
		]);

		expect(route[0].recipient_id).toBe('bangkok_user');
		expect(route[1].recipient_id).toBe('tokyo_user');
	});

	it('ends with an unaddressed leg home', () => {
		const route = plan_route(phnom_penh, [{ user_id: 'tokyo_user', coords: tokyo }]);
		const final_leg = route[route.length - 1];

		expect(final_leg.recipient_id).toBeNull();
		expect(final_leg.to).toEqual(phnom_penh);
	});

	it('sums its legs to the route total', () => {
		const route = plan_route(phnom_penh, [
			{ user_id: 'a', coords: bangkok },
			{ user_id: 'b', coords: tokyo },
			{ user_id: 'c', coords: london }
		]);
		const summed = route.reduce((total, leg) => total + leg.distance_km, 0);

		expect(route_total_km(route)).toBeCloseTo(summed, 6);
	});

	it('chains each leg from the previous destination', () => {
		const route = plan_route(phnom_penh, [
			{ user_id: 'a', coords: bangkok },
			{ user_id: 'b', coords: tokyo }
		]);

		expect(route[1].from).toEqual(route[0].to);
		expect(route[2].from).toEqual(route[1].to);
	});

	it('produces a single zero-length leg when there are no recipients', () => {
		const route = plan_route(phnom_penh, []);

		expect(route).toHaveLength(1);
		expect(route[0].distance_km).toBe(0);
	});
});

describe('delivery_schedule', () => {
	it('gives strictly increasing arrival times, nearest first', () => {
		const route = plan_route(phnom_penh, [
			{ user_id: 'a', coords: tokyo },
			{ user_id: 'b', coords: bangkok },
			{ user_id: 'c', coords: london }
		]);
		const schedule = delivery_schedule(route, 0);

		expect(schedule).toHaveLength(3);
		expect(schedule[0].deliver_at).toBeLessThan(schedule[1].deliver_at);
		expect(schedule[1].deliver_at).toBeLessThan(schedule[2].deliver_at);
	});

	it('reports cumulative distance flown to reach each recipient', () => {
		const route = plan_route(phnom_penh, [
			{ user_id: 'a', coords: bangkok },
			{ user_id: 'b', coords: tokyo }
		]);
		const schedule = delivery_schedule(route, 0);

		expect(schedule[0].distance_km).toBeCloseTo(route[0].distance_km, 6);
		expect(schedule[1].distance_km).toBeCloseTo(route[0].distance_km + route[1].distance_km, 6);
	});

	it('excludes the leg home', () => {
		const route = plan_route(phnom_penh, [{ user_id: 'a', coords: bangkok }]);

		expect(delivery_schedule(route, 0)).toHaveLength(1);
	});

	it('lands every recipient before the bird is available again', () => {
		const route = plan_route(phnom_penh, [
			{ user_id: 'a', coords: bangkok },
			{ user_id: 'b', coords: tokyo }
		]);
		const schedule = delivery_schedule(route, 0);
		const available_at = available_at_for(route, 0);

		for (const stop of schedule) {
			expect(available_at).toBeGreaterThan(stop.deliver_at);
		}
	});
});

describe('position_at', () => {
	const route = plan_route(phnom_penh, [{ user_id: 'bangkok_user', coords: bangkok }]);

	it('starts at the origin', () => {
		const start = position_at(route, 0, 0);

		expect(haversine_km(start.coords, phnom_penh)).toBeLessThan(0.001);
	});

	it('is back at the origin once the round trip completes', () => {
		const home = position_at(route, 0, available_at_for(route, 0));

		expect(haversine_km(home.coords, phnom_penh)).toBeLessThan(0.001);
	});

	it('stays at the origin after the round trip completes', () => {
		const later = position_at(route, 0, available_at_for(route, 0) + 5_000_000);

		expect(haversine_km(later.coords, phnom_penh)).toBeLessThan(0.001);
	});

	it('reaches the recipient at their scheduled arrival', () => {
		const [stop] = delivery_schedule(route, 0);
		const arrival = position_at(route, 0, stop.deliver_at);

		expect(haversine_km(arrival.coords, bangkok)).toBeLessThan(1);
	});

	it('is roughly halfway along the outbound leg at half its duration', () => {
		const [stop] = delivery_schedule(route, 0);
		const halfway = position_at(route, 0, stop.deliver_at / 2);

		expect(halfway.leg_index).toBe(0);
		expect(halfway.fraction).toBeCloseTo(0.5, 3);
	});

	it('clamps a time before departure to the origin', () => {
		const early = position_at(route, 10_000, 0);

		expect(haversine_km(early.coords, phnom_penh)).toBeLessThan(0.001);
	});

	it('never produces NaN for a same-place route', () => {
		const same_place = plan_route(phnom_penh, [{ user_id: 'a', coords: { ...phnom_penh } }]);
		const position = position_at(same_place, 0, 5_000);

		expect(Number.isFinite(position.coords.lat)).toBe(true);
		expect(Number.isFinite(position.coords.lng)).toBe(true);
	});
});

describe('progress_at', () => {
	const route = plan_route(phnom_penh, [{ user_id: 'a', coords: bangkok }]);

	it('is zero at departure and one on return', () => {
		expect(progress_at(route, 0, 0)).toBe(0);
		expect(progress_at(route, 0, available_at_for(route, 0))).toBe(1);
	});

	it('is one for a zero-length route', () => {
		expect(progress_at(plan_route(phnom_penh, []), 0, 0)).toBe(1);
	});
});

describe('plan_recall', () => {
	const route = plan_route(phnom_penh, [{ user_id: 'tokyo_user', coords: tokyo }]);
	const [stop] = delivery_schedule(route, 0);

	it('cancels a recipient the bird has not reached yet', () => {
		const recall = plan_recall(route, 0, stop.deliver_at / 2, phnom_penh);

		expect(recall.cancelled_recipient_ids).toEqual(['tokyo_user']);
	});

	it('leaves an already-delivered recipient alone', () => {
		const recall = plan_recall(route, 0, stop.deliver_at + 1, phnom_penh);

		expect(recall.cancelled_recipient_ids).toEqual([]);
	});

	it('gets the bird home sooner than finishing the route would', () => {
		const recall = plan_recall(route, 0, stop.deliver_at / 2, phnom_penh);

		expect(recall.available_at).toBeLessThan(available_at_for(route, 0));
	});

	it('returns a distance no greater than the outbound leg', () => {
		const recall = plan_recall(route, 0, stop.deliver_at / 2, phnom_penh);

		expect(recall.return_distance_km).toBeLessThanOrEqual(route[0].distance_km + 0.001);
	});
});

describe('fuzz_for_map', () => {
	it('is stable across repeated calls', () => {
		const first = fuzz_for_map(phnom_penh);

		for (let attempt = 0; attempt < 1000; attempt += 1) {
			const again = fuzz_for_map(phnom_penh);
			expect(again).toEqual(first);
		}
	});

	it('is idempotent', () => {
		const once = fuzz_for_map(tokyo);

		expect(fuzz_for_map(once)).toEqual(once);
	});

	it('stays within 1.5km of the true position', () => {
		for (const point of [phnom_penh, bangkok, tokyo, london, new_york, honolulu]) {
			expect(haversine_km(point, fuzz_for_map(point))).toBeLessThan(1.5);
		}
	});

	it('collapses nearby points onto the same cell', () => {
		// Roughly 30 metres apart.
		const nudged = { lat: phnom_penh.lat + 0.00027, lng: phnom_penh.lng };

		expect(fuzz_for_map(nudged)).toEqual(fuzz_for_map(phnom_penh));
	});

	it('survives the poles without dividing by zero', () => {
		const polar = fuzz_for_map({ lat: 90, lng: 25 });

		expect(Number.isFinite(polar.lat)).toBe(true);
		expect(Number.isFinite(polar.lng)).toBe(true);
	});
});

describe('project', () => {
	it('puts the origin at the centre of the viewBox', () => {
		expect(project({ lat: 0, lng: 0 }, 1000, 500)).toEqual({ x: 500, y: 250 });
	});

	it('puts Phnom Penh in the north-east quadrant', () => {
		const point = project(phnom_penh, 1000, 500);

		expect(point.x).toBeGreaterThan(700);
		expect(point.y).toBeLessThan(250);
	});

	it('puts New York in the north-west quadrant', () => {
		const point = project(new_york, 1000, 500);

		expect(point.x).toBeLessThan(400);
		expect(point.y).toBeLessThan(250);
	});
});

describe('route_bounds', () => {
	it('covers every point on the route', () => {
		const route = plan_route(phnom_penh, [{ user_id: 'a', coords: tokyo }]);
		const bounds = route_bounds(route);

		expect(bounds.min_lat).toBeCloseTo(phnom_penh.lat, 6);
		expect(bounds.max_lat).toBeCloseTo(tokyo.lat, 6);
	});
});

describe('flight_ms_for_km', () => {
	it('takes an hour to fly 80km', () => {
		expect(flight_ms_for_km(80)).toBe(3_600_000);
	});

	it('takes about 10 days to cross 19,000km', () => {
		const days = flight_ms_for_km(19_000) / 86_400_000;

		expect(days).toBeGreaterThan(9.8);
		expect(days).toBeLessThan(10.2);
	});
});

describe('flock_size_for', () => {
	it('gives normal users 10 pigeons', () => {
		expect(flock_size_for(false)).toBe(10);
	});

	it('gives verified users 20 pigeons', () => {
		expect(flock_size_for(true)).toBe(20);
	});
});

describe('is_valid_coords', () => {
	it('accepts real coordinates', () => {
		expect(is_valid_coords(phnom_penh)).toBe(true);
	});

	it('rejects out-of-range values', () => {
		expect(is_valid_coords({ lat: 91, lng: 0 })).toBe(false);
		expect(is_valid_coords({ lat: 0, lng: 181 })).toBe(false);
	});

	it('rejects non-finite and non-numeric values', () => {
		expect(is_valid_coords({ lat: Number.NaN, lng: 0 })).toBe(false);
		expect(is_valid_coords({ lat: '11.5', lng: 104.9 })).toBe(false);
	});

	it('rejects missing input', () => {
		expect(is_valid_coords(null)).toBe(false);
		expect(is_valid_coords(undefined)).toBe(false);
	});
});
