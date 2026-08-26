/**
 * Weather service: climatology model.
 *
 * Conditions come from `climate_condition(lat, lng, month)` — deterministic
 * geography-and-calendar weather with no upstream dependency. What used to be
 * a cache is now a pure function call: same cell and month always agree,
 * which preserves the hourly-stability property the map relied on.
 *
 * The module keeps its async shape and file name so callers (route weather at
 * release time, the viewport endpoint) did not have to change.
 */

import {
	weather_effects,
	default_weather,
	type WeatherCondition
} from '$lib/pigeon/weather';
import { climate_condition, current_month } from '$lib/pigeon/weather-climate';
import { get_route_event_weather, get_point_weather } from '$lib/pigeon/weather-events';
import type { Coords } from '$lib/pigeon/flight';

/** Raw reading kept alongside the classified condition, for map styling. */
export type WeatherReading = {
	condition: WeatherCondition;
	weather_code: number;
	wind_gusts_kmh: number;
	precipitation_mm: number;
	cloud_cover: number;
};

/** Grid key at 0.25 degree resolution. */
function cell_key(coords: Coords): string {
	return `${Math.round(coords.lat * 4)},${Math.round(coords.lng * 4)}`;
}

/** Inverse of the grid key: the rounded centre of a 0.25 degree cell. */
export function parse_cell_key(key: string): Coords {
	const [lat, lng] = key.split(',').map(Number);
	return { lat: lat / 4, lng: lng / 4 };
}

function reading_for(coords: Coords): WeatherReading {
	const res = get_point_weather(coords);
	const condition = res.condition;
	return {
		condition,
		// Synthetic sensor values consistent with the condition.
		weather_code: condition === 'clear' ? 0 : condition === 'cloudy' ? 2 : 61,
		wind_gusts_kmh: condition === 'hurricane' ? 130 : 20,
		precipitation_mm:
			condition === 'rain' ? 2 : condition === 'heavy_rain' ? 8 : condition === 'drizzle' ? 0.5 : 0,
		cloud_cover: condition === 'clear' ? 5 : condition === 'cloudy' ? 80 : 95
	};
}

/**
 * Readings for every distinct grid cell touched by the given points.
 */
export async function sample_conditions(
	points: Coords[]
): Promise<Map<string, WeatherReading>> {
	const readings = new Map<string, WeatherReading>();
	for (const point of points) {
		readings.set(cell_key(point), reading_for(point));
	}
	return readings;
}

export type RouteWeather = {
	condition: WeatherCondition;
	multiplier: number;
	/** Fraction of route distance spent inside severe weather (0–1). */
	exposure: number;
};

/**
 * Weather along a route based on intersecting weather events. The multiplier
 * is distance-weighted across the route rather than worst-point-wins.
 */
export async function get_route_weather(route: Coords[]): Promise<RouteWeather> {
	const res = get_route_event_weather(route);
	return {
		condition: res.condition,
		multiplier: res.multiplier,
		exposure: res.exposure
	};
}
