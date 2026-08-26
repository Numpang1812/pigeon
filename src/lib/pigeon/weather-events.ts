/**
 * Deterministic global weather events model.
 *
 * Weather is modeled as discrete severe systems (rain bands, thunderstorm
 * cells, cyclones, blizzards, sandstorms) anchored at fixed geographic cells.
 * Benign conditions (clear, cloudy, windy, haze, fog, drizzle) never spawn
 * events — the map shows hazards, not wallpaper, and most of the world stays
 * flyable at any given time.
 *
 * Lifecycle: conditions come from `climate_condition(cell, month, block)`,
 * which rolls per 6-hour block, so storms form and decay between blocks.
 * A per-cell "duty cycle" keeps each system alive for only part of the
 * month's blocks, so even monsoon cells alternate between hit and miss.
 *
 * Geometry: the anchor lattice is coarser than every event radius, which
 * guarantees flyable corridors between systems. Zoom-invariant: an event at
 * [11.5, 104.8] with radius 90 km exists at the exact same coordinates and
 * radius regardless of viewport zoom.
 */

import { climate_condition, current_month, region_for } from './weather-climate';
import {
	default_weather,
	resolve_effect,
	type RegionKey,
	type WeatherCondition,
	type WeatherEffect
} from './weather';
import { haversine_km, type Coords } from './flight';

export type WeatherEvent = {
	id: string;
	name: string;
	condition: WeatherCondition;
	/** Climate region the event sits in — drives regional severity overrides. */
	region: RegionKey;
	center: Coords;
	radius_km: number;
	radius_m: number;
	multiplier: number;
	effect: WeatherEffect;
};

/** Fixed global anchor spacing in degrees (~330 km). */
export const EVENT_GRID_STEP = 3;

/**
 * Conditions hazardous enough to spawn a visible event. Everything else is
 * treated as smooth flying: multiplier contribution of 1 on routes.
 */
export const SEVERE_CONDITIONS: ReadonlySet<WeatherCondition> = new Set([
	'rain',
	'heavy_rain',
	'snow',
	'sandstorm',
	'blizzard',
	'thunderstorm',
	'hurricane'
]);

/** Radius table in km: [base, jitter span] per severe condition. */
const EVENT_RADIUS_KM: Record<string, [number, number]> = {
	hurricane: [150, 60],
	blizzard: [95, 55],
	heavy_rain: [95, 55],
	thunderstorm: [65, 45],
	sandstorm: [75, 45],
	snow: [85, 45],
	rain: [75, 45]
};

/**
 * Share of a month's blocks a system stays active (0–100). Cyclones skip the
 * duty roll — their rarity is handled entirely by the climate gate.
 */
const DUTY_PCT: Record<string, number> = {
	rain: 55,
	heavy_rain: 65,
	snow: 50,
	sandstorm: 30,
	blizzard: 30,
	thunderstorm: 45,
	hurricane: 100
};

/** Stable integer hash */
function stable_hash(text: string): number {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/** 6-hour block of the day (0-3) */
export function current_time_block(): number {
	const hour = new Date().getUTCHours();
	return Math.floor(hour / 6);
}

const REGION_NAMES: Record<string, string> = {
	sea: 'Mekong / Indochina',
	east_asia: 'East Asian',
	south_asia: 'South Asian',
	pacific: 'Pacific',
	atlantic: 'Atlantic',
	indian: 'Indian Ocean',
	europe: 'European',
	americas: 'American',
	polar: 'Polar',
	tropics: 'Tropical'
};

function region_tag(lat: number, lng: number): string {
	if (Math.abs(lat) >= 60) return REGION_NAMES.polar;
	if (lat >= 5 && lat <= 28 && lng >= 90 && lng <= 112) return REGION_NAMES.sea;
	if (lat >= 20 && lat <= 50 && lng >= 100 && lng <= 145) return REGION_NAMES.east_asia;
	if (lat >= 5 && lat <= 35 && lng >= 65 && lng <= 95) return REGION_NAMES.south_asia;
	if (lat >= 35 && lat <= 65 && lng >= -15 && lng <= 45) return REGION_NAMES.europe;
	if (lng >= -130 && lng <= -60) return REGION_NAMES.americas;
	if (Math.abs(lat) <= 15) return REGION_NAMES.tropics;
	return 'Regional';
}

function build_event_name(effect_label: string, lat: number, lng: number, seed: number): string {
	const region = region_tag(lat, lng);
	const descriptors = ['System', 'Cell', 'Mass', 'Belt', 'Zone'];
	const desc = descriptors[seed % descriptors.length];
	return `${region} ${effect_label} ${desc}`;
}

/**
 * Generate a deterministic weather event for a fixed anchor coordinate.
 * Returns null when the cell is benign or its system is dormant this block.
 */
export function generate_anchor_event(
	grid_lat: number,
	grid_lng: number,
	month: number = current_month(),
	time_block: number = current_time_block()
): WeatherEvent | null {
	const anchor_id = `${grid_lat.toFixed(2)},${grid_lng.toFixed(2)}`;
	const hash = stable_hash(`${anchor_id}:${month}:${time_block}`);

	const condition = climate_condition(grid_lat, grid_lng, month, time_block);
	if (!SEVERE_CONDITIONS.has(condition)) {
		return null;
	}

	// Duty cycle: the same system is not active every block of its month.
	if (condition !== 'hurricane') {
		const duty_roll = stable_hash(`${anchor_id}:${month}:duty`) % 100;
		if (duty_roll >= (DUTY_PCT[condition] ?? 50)) return null;
	}

	// Slight geographic jitter so events don't sit on a rigid chessboard.
	const jitter_lat = ((hash % 100) / 100 - 0.5) * 0.7;
	const jitter_lng = (((hash >> 4) % 100) / 100 - 0.5) * 0.7;

	const center_lat = Math.max(-85, Math.min(85, grid_lat + jitter_lat));
	const center_lng = Math.max(-180, Math.min(180, grid_lng + jitter_lng));

	// Radius stays below half the lattice spacing so gaps always remain.
	const [base_radius, radius_span] = EVENT_RADIUS_KM[condition] ?? [80, 40];
	const radius_km = base_radius + ((hash >> 8) % radius_span);

	// Regional severity: Polar Blizzard ≠ temperate blizzard. Resolved once
	// here so flights and UI both consume the exact applied penalty.
	const region = region_for(center_lat, center_lng);
	const effect = resolve_effect(condition, region);
	const name = build_event_name(effect.label, center_lat, center_lng, hash);

	return {
		id: `wx-${anchor_id}-${month}`,
		name,
		condition,
		region,
		center: { lat: center_lat, lng: center_lng },
		radius_km,
		radius_m: radius_km * 1000,
		multiplier: effect.speed_multiplier,
		effect
	};
}

export type ViewportBounds = {
	min_lat: number;
	max_lat: number;
	min_lng: number;
	max_lng: number;
};

/** Max event radius (~210 km) plus jitter, in degrees at low latitudes. */
const BOUNDS_PADDING_DEG = 3;

/**
 * Get all active Weather Events intersecting a viewport bounding box.
 * Fully zoom-invariant: relies on fixed global anchor lattice.
 */
export function get_events_in_bounds(
	bounds: ViewportBounds,
	month: number = current_month(),
	time_block: number = current_time_block()
): WeatherEvent[] {
	const events: WeatherEvent[] = [];

	const min_lat = Math.max(-85, bounds.min_lat - BOUNDS_PADDING_DEG);
	const max_lat = Math.min(85, bounds.max_lat + BOUNDS_PADDING_DEG);
	let min_lng = bounds.min_lng - BOUNDS_PADDING_DEG;
	let max_lng = bounds.max_lng + BOUNDS_PADDING_DEG;

	if (max_lng - min_lng >= 360) {
		min_lng = -180;
		max_lng = 180;
	}

	const first_lat_idx = Math.floor(min_lat / EVENT_GRID_STEP);
	const last_lat_idx = Math.ceil(max_lat / EVENT_GRID_STEP);
	const first_lng_idx = Math.floor(min_lng / EVENT_GRID_STEP);
	const last_lng_idx = Math.ceil(max_lng / EVENT_GRID_STEP);

	for (let lat_idx = first_lat_idx; lat_idx <= last_lat_idx; lat_idx += 1) {
		const grid_lat = lat_idx * EVENT_GRID_STEP;
		if (grid_lat < -85 || grid_lat > 85) continue;

		for (let lng_idx = first_lng_idx; lng_idx <= last_lng_idx; lng_idx += 1) {
			let grid_lng = lng_idx * EVENT_GRID_STEP;
			// Normalize longitude wrap-around
			while (grid_lng > 180) grid_lng -= 360;
			while (grid_lng < -180) grid_lng += 360;

			const event = generate_anchor_event(grid_lat, grid_lng, month, time_block);
			if (event) {
				events.push(event);
			}
		}
	}

	return events;
}

export type PointWeather = {
	condition: WeatherCondition;
	multiplier: number;
	event: WeatherEvent | null;
};

/**
 * Query weather for a specific point on the globe by checking overlapping
 * events from neighbouring anchors.
 */
export function get_point_weather(
	point: Coords,
	month: number = current_month(),
	time_block: number = current_time_block()
): PointWeather {
	const events = get_events_in_bounds(
		{
			min_lat: point.lat - EVENT_GRID_STEP,
			max_lat: point.lat + EVENT_GRID_STEP,
			min_lng: point.lng - EVENT_GRID_STEP,
			max_lng: point.lng + EVENT_GRID_STEP
		},
		month,
		time_block
	);

	let worst_event: WeatherEvent | null = null;
	let worst_multiplier = 1;

	for (const event of events) {
		const dist_km = haversine_km(point, event.center);
		if (dist_km <= event.radius_km) {
			if (event.multiplier < worst_multiplier) {
				worst_multiplier = event.multiplier;
				worst_event = event;
			}
		}
	}

	if (worst_event) {
		return {
			condition: worst_event.condition,
			multiplier: worst_event.multiplier,
			event: worst_event
		};
	}

	return {
		condition: default_weather.condition,
		multiplier: default_weather.multiplier,
		event: null
	};
}

export type RouteWeatherResult = PointWeather & {
	/** Fraction of route distance spent inside severe weather (0–1). */
	exposure: number;
};

const LEG_SAMPLES = 4;
const SAMPLE_OFFSETS = [0.125, 0.375, 0.625, 0.875];

/**
 * Weather along an entire flight route.
 *
 * Scoring is distance-weighted instead of worst-point-wins: a leg grazing one
 * storm cell is barely penalised, while a leg crossing a monsoon wall feels
 * it proportionally. `multiplier` is the average speed factor over the whole
 * route; `exposure` is the fraction of distance inside any severe event.
 */
export function get_route_event_weather(
	route: Coords[],
	month: number = current_month(),
	time_block: number = current_time_block()
): RouteWeatherResult {
	if (route.length === 0) return { ...default_weather, event: null, exposure: 0 };

	let total_km = 0;
	let weighted_sum = 0;
	let exposed_km = 0;
	let worst_event: WeatherEvent | null = null;
	let worst_multiplier = 1;

	for (let i = 0; i < route.length - 1; i += 1) {
		const a = route[i];
		const b = route[i + 1];
		const leg_km = haversine_km(a, b);
		total_km += leg_km;

		let hits = 0;
		let hit_multiplier_sum = 0;

		for (const t of SAMPLE_OFFSETS) {
			const sample = {
				lat: a.lat + (b.lat - a.lat) * t,
				lng: a.lng + (b.lng - a.lng) * t
			};
			const res = get_point_weather(sample, month, time_block);
			if (res.event) {
				hits += 1;
				hit_multiplier_sum += res.multiplier;
				if (res.multiplier < worst_multiplier) {
					worst_multiplier = res.multiplier;
					worst_event = res.event;
				}
			}
		}

		const fraction = hits / LEG_SAMPLES;
		const avg_hit_multiplier = hits > 0 ? hit_multiplier_sum / hits : 1;
		const leg_multiplier = avg_hit_multiplier * fraction + (1 - fraction);

		weighted_sum += leg_km * leg_multiplier;
		exposed_km += leg_km * fraction;
	}

	if (total_km === 0) {
		// Degenerate single-point route: just read that point.
		return { ...get_point_weather(route[0], month, time_block), exposure: 0 };
	}

	if (worst_event) {
		return {
			condition: worst_event.condition,
			multiplier: Math.min(1, Math.max(0.05, weighted_sum / total_km)),
			event: worst_event,
			exposure: exposed_km / total_km
		};
	}

	return {
		condition: default_weather.condition,
		multiplier: default_weather.multiplier,
		event: null,
		exposure: exposed_km / total_km
	};
}
