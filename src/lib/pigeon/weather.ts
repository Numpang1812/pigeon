/**
 * Weather model for pigeon flights.
 *
 * Pure data shared by the server (locking a speed multiplier into a flight at
 * departure time) and the client (displaying the effect on the map). The
 * multiplier is unique per condition, so it doubles as a serialization format:
 * storing it on a flight row preserves both the timing math and the display
 * label without a second column.
 */

import { pigeon_speed_kmh } from './flight';

export type WeatherCondition =
	| 'clear'
	| 'cloudy'
	| 'windy'
	| 'haze'
	| 'fog'
	| 'drizzle'
	| 'rain'
	| 'heavy_rain'
	| 'snow'
	| 'sandstorm'
	| 'blizzard'
	| 'thunderstorm'
	| 'hurricane';

/**
 * Regions that modulate how hard a condition hits the bird. 'any' is the
 * baseline every region falls back to.
 */
export type RegionKey = 'any' | 'temperate' | 'polar' | 'asia' | 'tropical';

export const REGION_LABELS: Record<Exclude<RegionKey, 'any'>, string> = {
	temperate: '',
	polar: 'Polar',
	asia: 'Asian',
	tropical: 'Tropical'
};

export type WeatherEffect = {
	label: string;
	/** Fraction of normal cruise speed the bird manages in this weather. */
	speed_multiplier: number;
	/** Tailwind-ish accent used for map badges. */
	color: string;
};

/**
 * Baseline ('any' region) effects. Multipliers are UNIQUE per variant across
 * base table AND regional overrides: stored on flight rows they must round
 * back through describe_multiplier without ambiguity. Guarded by a test.
 *
 * Baseline anchors (see weather-region.test.ts):
 *   cloudy −3%, rain −10%, snow −12%, heavy rain −25%.
 * Extreme variants live in REGIONAL_MULTIPLIERS below — ordinary snow must
 * NOT rank worse than heavy rain just because both are "cold/wet".
 */
export const weather_effects: Record<WeatherCondition, WeatherEffect> = {
	clear: { label: 'Clear', speed_multiplier: 1, color: '#10b981' },
	cloudy: { label: 'Cloudy', speed_multiplier: 0.97, color: '#94a3b8' },
	haze: { label: 'Haze', speed_multiplier: 0.95, color: '#a16207' },
	windy: { label: 'Windy', speed_multiplier: 0.93, color: '#64748b' },
	fog: { label: 'Fog', speed_multiplier: 0.91, color: '#9ca3af' },
	drizzle: { label: 'Drizzle', speed_multiplier: 0.89, color: '#38bdf8' },
	rain: { label: 'Rain', speed_multiplier: 0.9, color: '#0284c7' },
	snow: { label: 'Snow', speed_multiplier: 0.88, color: '#0891b2' },
	heavy_rain: { label: 'Heavy Rain', speed_multiplier: 0.75, color: '#1d4ed8' },
	thunderstorm: { label: 'Thunderstorm', speed_multiplier: 0.72, color: '#7c3aed' },
	sandstorm: { label: 'Sandstorm', speed_multiplier: 0.65, color: '#ea580c' },
	blizzard: { label: 'Blizzard', speed_multiplier: 0.55, color: '#7dd3fc' },
	hurricane: { label: 'Hurricane', speed_multiplier: 0.2, color: '#dc2626' }
};

/**
 * Regional overrides: same sky, different danger.
 *
 *   Polar + Snow        = −30%  (extreme cold, whiteout glare)
 *   Polar + Blizzard    = −75%  (an extreme event, not "more snow")
 *   Asia + Thunderstorm = −40%  (monsoon convection is violent and widespread)
 *
 * Hurricanes are inherently tropical, so their severity lives in the base
 * table (−80%). Tune entries here without touching any flight math.
 */
export const REGIONAL_MULTIPLIERS: Record<
	Exclude<RegionKey, 'any'>,
	Partial<Record<WeatherCondition, number>>
> = {
	temperate: {},
	polar: { snow: 0.7, blizzard: 0.25 },
	asia: { thunderstorm: 0.6 },
	tropical: {}
};

type WeatherVariant = {
	condition: WeatherCondition;
	region: RegionKey;
	effect: WeatherEffect;
};

/** Every playable variant: regional overrides first, then the base table. */
export const WEATHER_VARIANTS: WeatherVariant[] = [
	...(
		Object.entries(REGIONAL_MULTIPLIERS) as Array<
			[Exclude<RegionKey, 'any'>, Partial<Record<WeatherCondition, number>>]
		>
	).flatMap(([region, entries]) =>
		Object.entries(entries).map(([condition, multiplier]) => ({
			condition: condition as WeatherCondition,
			region,
			effect: {
				label:
					`${REGION_LABELS[region]} ${weather_effects[condition as WeatherCondition].label}`.trim(),
				speed_multiplier: multiplier as number,
				color: weather_effects[condition as WeatherCondition].color
			}
		}))
	),
	...Object.entries(weather_effects).map(([condition, effect]) => ({
		condition: condition as WeatherCondition,
		region: 'any' as const,
		effect
	}))
];

/**
 * Resolve the effect for a condition in a region: the regional override when
 * one exists, otherwise the baseline. THE lookup flight math uses.
 */
export function resolve_effect(
	condition: WeatherCondition,
	region: RegionKey = 'any'
): WeatherEffect {
	if (region !== 'any') {
		const override = REGIONAL_MULTIPLIERS[region]?.[condition];
		if (override !== undefined) {
			const base = weather_effects[condition];
			return {
				label: `${REGION_LABELS[region]} ${base.label}`.trim(),
				speed_multiplier: override,
				color: base.color
			};
		}
	}
	return weather_effects[condition];
}

/**
 * Decode a stored multiplier back into its exact variant (condition + region +
 * resolved effect). Unique multipliers make this lossless for values this
 * module produced; unknown values fall back to clear.
 */
export function describe_multiplier(multiplier: number): WeatherVariant {
	for (const variant of WEATHER_VARIANTS) {
		if (variant.effect.speed_multiplier === multiplier) return variant;
	}
	return { condition: 'clear', region: 'any', effect: weather_effects.clear };
}

/**
 * Recover the condition family from a stored multiplier. Legacy helper kept
 * for callers that only need the broad condition; prefer describe_multiplier
 * for labelled display so regional variants keep their prefix and penalty.
 */
export function condition_from_multiplier(multiplier: number): WeatherCondition {
	return describe_multiplier(multiplier).condition;
}

/** Beaufort force 12 — hurricane-force gusts ground most of the flock. */
export const hurricane_wind_gusts_kmh = 118;

/**
 * Map a WMO weather interpretation code plus gust reading to a condition.
 *
 * Gusts are checked first: a hurricane overrides whatever the sky code says.
 */
export function wmo_to_condition(
	weather_code: number,
	wind_gusts_kmh: number
): WeatherCondition {
	if (Number.isFinite(wind_gusts_kmh) && wind_gusts_kmh >= hurricane_wind_gusts_kmh) {
		return 'hurricane';
	}

	if (weather_code === 45 || weather_code === 48) return 'fog';
	if (weather_code >= 95) return 'thunderstorm';
	if ((weather_code >= 71 && weather_code <= 77) || weather_code === 85 || weather_code === 86) {
		return 'snow';
	}
	if (weather_code === 65 || weather_code === 81 || weather_code === 82) return 'heavy_rain';
	if (weather_code >= 61 && weather_code <= 64) return 'rain';
	if ((weather_code >= 51 && weather_code <= 57) || weather_code === 80) return 'drizzle';
	if (weather_code >= 2) return 'cloudy';

	return 'clear';
}

/** Cruise speed a bird achieves under the given multiplier. */
export function effective_speed_kmh(multiplier: number): number {
	return pigeon_speed_kmh * multiplier;
}

/** Slowdown percentage for display ("Rain slows the bird by 25%"). */
export function slowdown_percent(multiplier: number): number {
	return Math.round((1 - multiplier) * 100);
}

/** The no-weather fallback used whenever conditions cannot be determined. */
export const default_weather: { condition: WeatherCondition; multiplier: number } = {
	condition: 'clear',
	multiplier: weather_effects.clear.speed_multiplier
};
