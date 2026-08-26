import { describe, it, expect } from 'vitest';
import {
	get_events_in_bounds,
	get_point_weather,
	get_route_event_weather,
	SEVERE_CONDITIONS,
	type WeatherEvent
} from './weather-events';
import type { Coords } from './flight';

const WORLD = { min_lat: -85, max_lat: 85, min_lng: -180, max_lng: 180 };
const BLOCKS = [0, 1, 2, 3];

describe('weather events system', () => {
	it('is zoom-invariant: returns identical event at city zoom and country zoom', () => {
		const country_view = {
			min_lat: 10,
			max_lat: 15,
			min_lng: 102,
			max_lng: 108
		};
		const city_view = {
			min_lat: 11.5,
			max_lat: 11.6,
			min_lng: 104.85,
			max_lng: 104.95
		};

		const country_events = get_events_in_bounds(country_view, 6, 1);
		const city_events = get_events_in_bounds(city_view, 6, 1);

		for (const ce of city_events) {
			const matched = country_events.find((e) => e.id === ce.id);
			if (matched) {
				expect(matched.center.lat).toBe(ce.center.lat);
				expect(matched.center.lng).toBe(ce.center.lng);
				expect(matched.radius_km).toBe(ce.radius_km);
				expect(matched.condition).toBe(ce.condition);
				expect(matched.name).toBe(ce.name);
			}
		}
	});

	it('produces persistent point weather invariant of view context', () => {
		const phnom_penh = { lat: 11.5564, lng: 104.9282 };
		const first = get_point_weather(phnom_penh, 6, 1);
		const second = get_point_weather(phnom_penh, 6, 1);

		expect(first.condition).toBe(second.condition);
		expect(first.multiplier).toBe(second.multiplier);
		if (first.event && second.event) {
			expect(first.event.name).toBe(second.event.name);
			expect(first.event.radius_km).toBe(second.event.radius_km);
		}
	});

	it('computes route event weather consistently with exposure in range', () => {
		const route: Coords[] = [
			{ lat: 11.5564, lng: 104.9282 },
			{ lat: 13.3671, lng: 103.8448 } // Siem Reap
		];

		const weather = get_route_event_weather(route, 6, 1);
		expect(weather.multiplier).toBeGreaterThan(0);
		expect(weather.multiplier).toBeLessThanOrEqual(1);
		expect(weather.exposure).toBeGreaterThanOrEqual(0);
		expect(weather.exposure).toBeLessThanOrEqual(1);
	});

	it('only spawns severe events — benign conditions never become circles', () => {
		for (const block of BLOCKS) {
			const events = get_events_in_bounds(WORLD, 6, block);
			for (const event of events) {
				expect(SEVERE_CONDITIONS.has(event.condition)).toBe(true);
			}
		}
	});

	it('leaves flyable corridors even during peak monsoon', () => {
		let clear_points = 0;
		let total = 0;
		for (let lat = 10; lat <= 14; lat += 1) {
			for (let lng = 102; lng <= 106; lng += 1) {
				total += 1;
				if (get_point_weather({ lat, lng }, 6, 1).event === null) clear_points += 1;
			}
		}
		expect(clear_points / total).toBeGreaterThan(0.25);
	});

	it('keeps global hurricane counts scarce and bounded per block', () => {
		let hurricanes = 0;
		for (const block of BLOCKS) {
			const storms = get_events_in_bounds(WORLD, 8, block).filter(
				(e) => e.condition === 'hurricane'
			);
			expect(storms.length).toBeLessThan(40);
			hurricanes += storms.length;
		}
		expect(hurricanes).toBeGreaterThan(0);
	});

	it('keeps event radii inside the lattice gaps (hurricanes excepted)', () => {
		const all: WeatherEvent[] = [];
		for (const month of [0, 6]) {
			for (const block of BLOCKS) {
				all.push(...get_events_in_bounds({ min_lat: -40, max_lat: 40, min_lng: -60, max_lng: 60 }, month, block));
			}
		}
		expect(all.length).toBeGreaterThan(0);
		for (const event of all) {
			if (event.condition === 'hurricane') {
				expect(event.radius_km).toBeLessThan(215);
			} else {
				expect(event.radius_km).toBeLessThan(165);
			}
		}
	});
});
