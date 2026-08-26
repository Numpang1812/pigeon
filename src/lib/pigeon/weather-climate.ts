/**
 * Climatology-based weather model.
 *
 * Deterministic fake weather from geography and the calendar. Structure is
 * Köppen-inspired (ice caps, tundra, subarctic, continental, oceanic,
 * Mediterranean, steppe-desert, savanna, rainforest) with regional monsoon
 * boxes and tropical-cyclone basin gates layered on top.
 *
 * Land vs sea: `is_land` from the coarse land mask routes every cell into a
 * MARINE regime (trade belts, westerlies, doldrums, polar seas, cyclone
 * genesis) or a CONTINENTAL regime (monsoons, convective afternoon storms,
 * deserts). Oceans are calmer on average than land — the trades sit under
 * the subtropical highs — while severe storms live in physical niches:
 * cyclones are born at sea, thunderstorms cook up over warm land afternoons.
 *
 * Diurnal cycle: the `time_block` argument (6-hour UTC block, 0–3) shifts
 * thunderstorm weight toward each longitude's local-solar afternoon block.
 *
 * Sources for the seasonal windows: IPCC AR6 Annex V (regional monsoon
 * domains), Wikipedia's monsoon onset/withdrawal table, NOAA/Met Office
 * tropical cyclone climatology (basin seasons and peaks).
 *
 * Same inputs always yield the same output: identical (cell, month, block)
 * triples agree forever, which keeps the map stable without an upstream API.
 */

import type { RegionKey, WeatherCondition } from './weather';
import { is_land } from './land-mask';

/** Weighted outcome table — weights are relative, not percentages. */
type Outcome = [WeatherCondition, number];

const SEASON_MONTHS = {
	winter: [11, 0, 1] as const,
	spring: [2, 3, 4] as const,
	summer: [5, 6, 7] as const,
	fall: [8, 9, 10] as const
};

function season_of(lat: number, month: number): keyof typeof SEASON_MONTHS {
	const north: (keyof typeof SEASON_MONTHS)[] = [
		'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
		'summer', 'summer', 'fall', 'fall', 'fall', 'winter'
	];
	// Southern hemisphere runs six months ahead.
	return lat >= 0 ? north[month] : north[(month + 6) % 12];
}

/** Stable small integer from a string, for picking inside outcome tables. */
function stable_hash(text: string): number {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function pick(outcomes: Outcome[], seed_text: string): WeatherCondition {
	const total = outcomes.reduce((sum, [, weight]) => sum + weight, 0);
	let roll = stable_hash(seed_text) % total;
	for (const [condition, weight] of outcomes) {
		if (roll < weight) return condition;
		roll -= weight;
	}
	return outcomes[outcomes.length - 1][0];
}

/** Current 6-hour UTC block (0–3). */
function default_time_block(): number {
	return Math.floor(new Date().getUTCHours() / 6);
}

type Box = {
	min_lat: number;
	max_lat: number;
	min_lng: number;
	max_lng: number;
};

const in_box = (box: Box, lat: number, lng: number): boolean =>
	lat >= box.min_lat && lat <= box.max_lat && lng >= box.min_lng && lng <= box.max_lng;

/**
 * Regional monsoon / climate boxes.
 * Checked before latitude bands. First match wins.
 */
const BOX = {
	sahara_desert: { min_lat: 17, max_lat: 32, min_lng: -17, max_lng: 34 },
	arabian_desert: { min_lat: 13, max_lat: 32, min_lng: 34, max_lng: 60 },
	australian_outback: { min_lat: -30, max_lat: -18, min_lng: 114, max_lng: 146 },
	west_africa: { min_lat: 4, max_lat: 20, min_lng: -18, max_lng: 30 },
	mediterranean_europe: { min_lat: 30, max_lat: 46, min_lng: -10, max_lng: 40 },
	california: { min_lat: 32, max_lat: 43, min_lng: -126, max_lng: -114 },
	central_chile: { min_lat: -38, max_lat: -30, min_lng: -74, max_lng: -69 },
	south_africa_tip: { min_lat: -35, max_lat: -32, min_lng: 17, max_lng: 28 },
	south_west_australia: { min_lat: -35, max_lat: -31, min_lng: 114, max_lng: 120 },
	amazon: { min_lat: -15, max_lat: 6, min_lng: -75, max_lng: -45 },
	north_australia: { min_lat: -21, max_lat: -11, min_lng: 125, max_lng: 145 },
	bay_of_bengal: { min_lat: 5, max_lat: 23, min_lng: 80, max_lng: 95 },
	south_asia: { min_lat: 5, max_lat: 32, min_lng: 65, max_lng: 95 },
	mainland_sea: { min_lat: 8, max_lat: 28, min_lng: 92, max_lng: 110 },
	maritime_sea: { min_lat: -11, max_lat: 21, min_lng: 110, max_lng: 141 },
	east_asia: { min_lat: 22, max_lat: 48, min_lng: 100, max_lng: 147 }
} as const;

// ==========================================
// Diurnal convection over warm land
// ==========================================

/**
 * Block whose 6-hour window contains local solar afternoon (~13:00) at this
 * longitude. Thunderstorm weight peaks there and bottoms out opposite.
 */
export function peak_convective_block(lng: number): number {
	const raw = Math.round((12 - lng / 15) / 6);
	return ((raw % 4) + 4) % 4;
}

const DIURNAL_BAND_MAX_LAT = 45;

/** Scale thunderstorm weight by distance from the local afternoon block. */
function with_diurnal(outcomes: Outcome[], lng: number, time_block: number): Outcome[] {
	const delta = (((time_block - peak_convective_block(lng)) % 4) + 4) % 4;
	const factor = delta === 0 ? 2.4 : delta === 3 || delta === 1 ? 0.9 : 0.4;
	return outcomes.map(([condition, weight]): Outcome =>
		condition === 'thunderstorm'
			? [condition, Math.max(1, Math.round(weight * factor))]
			: [condition, weight]
	);
}

function land_pick(
	outcomes: Outcome[],
	seed_text: string,
	lat: number,
	lng: number,
	time_block: number
): WeatherCondition {
	const table =
		Math.abs(lat) < DIURNAL_BAND_MAX_LAT ? with_diurnal(outcomes, lng, time_block) : outcomes;
	return pick(table, seed_text);
}

// ==========================================
// Marine regimes (ocean cells)
// ==========================================

/** Doldrums / ITCZ: convergence cloud and squalls hugging the equator. */
const doldrum_outcomes: Outcome[] = [
	['cloudy', 28], ['rain', 22], ['clear', 20], ['drizzle', 12], ['thunderstorm', 18]
];

/**
 * Trade-wind belt under the subtropical highs: the calm flyway of the open
 * ocean — mostly clear skies, steady breeze, little rain.
 */
const trade_outcomes: Outcome[] = [
	['clear', 54], ['cloudy', 24], ['windy', 10], ['drizzle', 7], ['rain', 5]
];

/** Mid-latitude storm tracks: frontal systems parade through year-round. */
function westerly_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'winter':
			return [['windy', 30], ['cloudy', 24], ['rain', 18], ['drizzle', 12], ['clear', 10], ['fog', 6]];
		case 'summer':
			return [['cloudy', 26], ['clear', 24], ['rain', 16], ['drizzle', 14], ['windy', 14], ['fog', 6]];
		default:
			return [['cloudy', 26], ['windy', 20], ['rain', 16], ['drizzle', 12], ['clear', 16], ['fog', 10]];
	}
}

/** Polar seas: sea ice, snow showers, the odd polar low. */
function polar_sea_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'winter':
			return [['snow', 40], ['cloudy', 26], ['blizzard', 14], ['clear', 14], ['windy', 6]];
		default:
			return [['snow', 22], ['cloudy', 30], ['clear', 36], ['fog', 6], ['blizzard', 6]];
	}
}

/** Roaring Forties / Furious Fifties: the Southern Ocean never stops blowing. */
const southern_ocean_outcomes: Outcome[] = [
	['windy', 52], ['cloudy', 20], ['drizzle', 16], ['rain', 12]
];

/** Grand Banks / Newfoundland: fog capital of the North Atlantic. */
const grand_banks_box: Box = { min_lat: 42, max_lat: 50, min_lng: -56, max_lng: -42 };
const grand_banks_outcomes: Outcome[] = [
	['fog', 34], ['cloudy', 26], ['clear', 18], ['windy', 12], ['drizzle', 10]
];

// ==========================================
// Tropical cyclone basins (ocean only)
// ==========================================

/**
 * Tropical cyclone basins with season and peak windows (month indices).
 * Northern basins peak late summer; the North Indian has double peaks in
 * May and November; southern basins run Nov–Apr peaking Feb–Mar.
 */
const CYCLONE_BASINS: Array<{
	box: Box;
	season_months: number[];
	peak_months: number[];
}> = [
	// Atlantic, Caribbean, Gulf of Mexico: Jun–Nov, peak Sep.
	{ box: { min_lat: 5, max_lat: 42, min_lng: -100, max_lng: -12 }, season_months: [5, 6, 7, 8, 9, 10], peak_months: [8, 9] },
	// Eastern Pacific: May–Nov, peak Aug–Sep.
	{ box: { min_lat: 4, max_lat: 26, min_lng: -140, max_lng: -88 }, season_months: [4, 5, 6, 7, 8, 9, 10], peak_months: [7, 8] },
	// Northwest Pacific (typhoons): year-round, main Jul–Nov, peak Aug–Sep.
	{ box: { min_lat: 4, max_lat: 32, min_lng: 105, max_lng: 180 }, season_months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], peak_months: [7, 8, 9] },
	// North Indian (Bay of Bengal / Arabian Sea): double peak May & Nov.
	{ box: { min_lat: 4, max_lat: 24, min_lng: 50, max_lng: 96 }, season_months: [3, 4, 9, 10, 11], peak_months: [4, 10] },
	// Southwest Indian (Madagascar side): Nov–Apr, peaks Jan & Feb–Mar.
	{ box: { min_lat: -28, max_lat: -4, min_lng: 42, max_lng: 100 }, season_months: [10, 11, 0, 1, 2, 3], peak_months: [0, 1, 2] },
	// Australian / Southwest Pacific: Nov–Apr, peak Feb–Mar.
	{ box: { min_lat: -30, max_lat: -6, min_lng: 100, max_lng: 200 }, season_months: [10, 11, 0, 1, 2, 3], peak_months: [1, 2] }
];

/**
 * Probabilistic hurricane gate for ocean cells inside a cyclone basin.
 * Seeded per ~3° storm cell + month + block, so a handful of discrete storms
 * are alive during any given block instead of a season-long red smear.
 * Returns 'hurricane' when this storm cell is active, else null — the caller
 * falls through to ordinary marine logic.
 */
function cyclone_roll(
	lat: number,
	lng: number,
	month: number,
	time_block: number
): WeatherCondition | null {
	for (const basin of CYCLONE_BASINS) {
		if (!in_box(basin.box, lat, lng)) continue;
		if (!basin.season_months.includes(month)) return null;

		const cell_lat = Math.round(lat / 3) * 3;
		const cell_lng = Math.round(lng / 3) * 3;
		const seed = `${cell_lat},${cell_lng}:${month}:cyclone:${time_block}`;
		const peak = basin.peak_months.includes(month);
		// ~2% of peak-season storm cells alive per block, <1% at the edges.
		return stable_hash(seed) % 1000 < (peak ? 22 : 8) ? 'hurricane' : null;
	}
	return null;
}

// ==========================================
// Continental regimes (land cells)
// ==========================================

/** Hot deserts (Sahara, Arabia, outback): dry air; spring winds raise dust. */
function desert_month(month: number): Outcome[] {
	if (month >= 2 && month <= 4) {
		return [['clear', 60], ['cloudy', 18], ['windy', 10], ['sandstorm', 12]];
	}
	return [['clear', 72], ['cloudy', 18], ['windy', 10]];
}

/**
 * West Africa: ITCZ jumps to the Sahel late June — wet Jun–Sep with an Oct
 * second peak on the coast; Nov–Mar is dry-season Harmattan, which carries
 * Saharan dust (haze near the coast, sandstorms on desert edges).
 */
function west_africa_month(lat: number, month: number): Outcome[] {
	if (month >= 5 && month <= 9) {
		// Wet season: heavier toward the Sahel after the monsoon jump.
		return lat >= 12
			? [['rain', 30], ['cloudy', 24], ['heavy_rain', 12], ['thunderstorm', 14], ['clear', 20]]
			: [['rain', 28], ['thunderstorm', 18], ['cloudy', 24], ['clear', 30]];
	}
	if (month === 10) {
		// Retreating rains: coastal second maximum.
		return [['rain', 24], ['cloudy', 30], ['thunderstorm', 12], ['clear', 34]];
	}
	if (month === 3 || month === 4) {
		// Transition: first storms build.
		return [['clear', 36], ['cloudy', 26], ['thunderstorm', 20], ['haze', 18]];
	}
	// Nov–Mar Harmattan: dust thickens with latitude.
	return lat >= 14
		? [['haze', 32], ['sandstorm', 12], ['clear', 38], ['cloudy', 18]]
		: [['haze', 26], ['clear', 48], ['cloudy', 26]];
}

/** Mediterranean pattern (also California, Chile, Cape, SW Australia):
 *  bone-dry summers, wet winters. */
const mediterranean_summer: Outcome[] = [
	['clear', 78], ['cloudy', 16], ['windy', 6]
];
const mediterranean_winter: Outcome[] = [
	['rain', 34], ['cloudy', 30], ['clear', 24], ['drizzle', 12]
];
function mediterranean_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'summer': return mediterranean_summer;
		case 'winter': return mediterranean_winter;
		default: return [['clear', 46], ['cloudy', 30], ['rain', 20], ['fog', 4]];
	}
}

/** Amazon: South American monsoon — wet Dec–Mar, drier Jul–Sep. */
function amazon_month(month: number): Outcome[] {
	if ([11, 0, 1, 2].includes(month)) {
		return [['rain', 34], ['cloudy', 24], ['thunderstorm', 20], ['heavy_rain', 12], ['clear', 10]];
	}
	if ([6, 7, 8].includes(month)) {
		return [['clear', 30], ['cloudy', 30], ['rain', 22], ['drizzle', 18]];
	}
	return [['rain', 30], ['cloudy', 28], ['thunderstorm', 18], ['clear', 24]];
}

/** Northern Australia: monsoonal — wet Nov–Apr, bone-dry May–Oct. */
function north_australia_month(month: number): Outcome[] {
	if ([10, 11, 0, 1, 2, 3].includes(month)) {
		return [['rain', 30], ['cloudy', 24], ['thunderstorm', 22], ['heavy_rain', 12], ['clear', 12]];
	}
	return [['clear', 70], ['cloudy', 22], ['haze', 8]];
}

/** Bay of Bengal coast (land side of the box): Indian monsoon arrives first. */
function bay_of_bengal_month(month: number): Outcome[] {
	if (month >= 5 && month <= 8) {
		return [['rain', 30], ['heavy_rain', 20], ['cloudy', 22], ['thunderstorm', 14], ['clear', 14]];
	}
	if (month === 4 || month === 10 || month === 11) {
		return [['thunderstorm', 22], ['rain', 26], ['cloudy', 26], ['clear', 26]];
	}
	return [['clear', 44], ['cloudy', 30], ['haze', 14], ['rain', 12]];
}

/** South Asia: SW monsoon Jun–Sep (>75% of annual rain), NE monsoon over the
 *  southeast peninsula Oct–Dec, hazy dry winters, pre-monsoon heat storms. */
function south_asia_month(month: number): Outcome[] {
	if (month >= 5 && month <= 8) {
		return [['rain', 34], ['heavy_rain', 20], ['cloudy', 22], ['thunderstorm', 12], ['clear', 12]];
	}
	if (month === 9 || month === 10) {
		// Retreating monsoon; Tamil Nadu's wettest weeks.
		return [['rain', 28], ['cloudy', 30], ['thunderstorm', 16], ['clear', 26]];
	}
	if (month >= 11 || month <= 1) {
		return [['clear', 50], ['haze', 18], ['cloudy', 22], ['fog', 10]];
	}
	// Feb–May pre-monsoon: building heat, afternoon thunderstorms.
	return [['clear', 32], ['cloudy', 26], ['thunderstorm', 24], ['haze', 18]];
}

/** Mainland Southeast Asia: SW monsoon May–Oct, NE monsoon Nov–Feb milder,
 *  hot dry Mar–Apr made smoky by regional burn season. */
function mainland_sea_month(month: number): Outcome[] {
	if (month >= 4 && month <= 9) {
		return [['rain', 34], ['heavy_rain', 20], ['cloudy', 22], ['thunderstorm', 12], ['clear', 12]];
	}
	if (month === 2 || month === 3) {
		// Burn season: haze dominates the hot months.
		return [['haze', 30], ['clear', 32], ['cloudy', 22], ['thunderstorm', 16]];
	}
	// Oct transition + Nov–Jan northeast monsoon.
	return [['rain', 26], ['cloudy', 32], ['thunderstorm', 12], ['clear', 30]];
}

/** Maritime Southeast Asia islands (Philippines, Indonesia, Malaysia): wet
 *  when the monsoon trough sits overhead — Amihan Oct–Mar for the Philippines,
 *  Nov–Mar for Java; less sharply seasonal than the mainland. */
function maritime_sea_month(month: number): Outcome[] {
	if ([10, 11, 0, 1, 2].includes(month)) {
		return [['rain', 30], ['cloudy', 26], ['thunderstorm', 20], ['heavy_rain', 12], ['clear', 12]];
	}
	if (month === 3 || month === 9) {
		return [['rain', 28], ['cloudy', 30], ['thunderstorm', 18], ['clear', 24]];
	}
	// Apr–Aug: relative lull south of the equator-facing trough.
	return [['cloudy', 30], ['rain', 24], ['clear', 26], ['thunderstorm', 20]];
}

/** East Asia: Meiyu/Baiu rain belt mid-May–Jul sweeping north, autumn rains
 *  Sep–Oct over Japan/Korea, dry cold winters, yellow-dust spring winds. */
function east_asia_month(month: number): Outcome[] {
	if (month === 4 || month === 5 || month === 6) {
		return [['rain', 32], ['cloudy', 28], ['thunderstorm', 14], ['clear', 26]];
	}
	if (month === 8 || month === 9) {
		return [['cloudy', 30], ['rain', 24], ['clear', 32], ['thunderstorm', 14]];
	}
	if (month === 2 || month === 3) {
		// Spring: Mongolian dust rides the winds.
		return [['windy', 20], ['haze', 14], ['clear', 32], ['cloudy', 26], ['rain', 8]];
	}
	if (month >= 10 || month <= 1) {
		return [['clear', 46], ['cloudy', 28], ['windy', 12], ['snow', 14]];
	}
	// Jul–Aug: monsoon tail, hot and humid.
	return [['rain', 28], ['cloudy', 28], ['thunderstorm', 16], ['clear', 28]];
}

/** Subarctic/tundra belt: brutal winters can blizzard, brief cool summers. */
function subarctic_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'winter':
			return [['snow', 46], ['cloudy', 24], ['clear', 10], ['blizzard', 10], ['windy', 6], ['fog', 4]];
		case 'summer':
			return [['clear', 28], ['cloudy', 28], ['rain', 26], ['thunderstorm', 10], ['fog', 8]];
		default:
			return [['cloudy', 38], ['clear', 22], ['snow', 16], ['rain', 14], ['fog', 10]];
	}
}

/** Humid continental belt (N America, Europe): four real seasons,
 *  windy winter lows. */
function continental_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'winter':
			return [
				['snow', 30], ['cloudy', 30], ['clear', 16], ['windy', 14], ['rain', 10]
			];
		case 'summer':
			return [
				['clear', 40], ['cloudy', 26], ['rain', 16], ['thunderstorm', 14], ['fog', 4]
			];
		default:
			return [['clear', 34], ['cloudy', 30], ['rain', 20], ['fog', 10], ['windy', 6]];
	}
}

/** Warm temperate/subtropical belt: mild winters, stormy summer afternoons. */
function subtropical_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'summer':
			return [
				['clear', 40], ['cloudy', 22], ['thunderstorm', 18], ['rain', 20]
			];
		case 'winter':
			return [['cloudy', 34], ['clear', 32], ['rain', 22], ['windy', 12]];
		default:
			return [['clear', 38], ['cloudy', 30], ['rain', 20], ['fog', 12]];
	}
}

/** Savanna/trade-wind tropics: wet season vs dry season by hemisphere. */
function savanna_season(lat: number, month: number): Outcome[] {
	const northern_wet = month >= 4 && month <= 9;
	const wet = lat >= 0 ? northern_wet : !northern_wet;
	if (wet) {
		return [['rain', 28], ['cloudy', 24], ['thunderstorm', 18], ['clear', 30]];
	}
	return [['clear', 52], ['cloudy', 24], ['haze', 12], ['fog', 12]];
}

/** Equatorial rainforest: convective storms year-round, mostly afternoon. */
const rainforest_outcomes: Outcome[] = [
	['rain', 26], ['cloudy', 26], ['clear', 24], ['thunderstorm', 16], ['drizzle', 8]
];

/** Patagonia / cold southern tip: raw westerlies, quick passing fronts. */
const patagonia_outcomes: Outcome[] = [
	['windy', 26], ['cloudy', 24], ['clear', 18], ['drizzle', 14], ['rain', 12], ['snow', 6]
];

// ==========================================
// Ice caps
// ==========================================

/** Deep ice caps: snow-dominated, but not a permanent whiteout. */
function ice_cap_season(season: keyof typeof SEASON_MONTHS): Outcome[] {
	switch (season) {
		case 'summer':
			return [['snow', 34], ['cloudy', 26], ['clear', 32], ['blizzard', 8]];
		default:
			return [['snow', 44], ['cloudy', 22], ['blizzard', 16], ['clear', 18]];
	}
}

// ==========================================
// Entry point
// ==========================================

/**
 * Condition for one grid cell in one calendar month (0–11) and one 6-hour
 * UTC block (0–3). Defaults to the current block.
 */
export function climate_condition(
	lat: number,
	lng: number,
	month: number,
	time_block: number = default_time_block()
): WeatherCondition {
	const seed = `${Math.round(lat * 4)},${Math.round(lng * 4)}:${month}`;
	const season = season_of(lat, month);
	const abs_lat = Math.abs(lat);

	// ---- Ocean half of the planet ----
	if (!is_land(lat, lng)) {
		// Cyclones gate first: discrete ocean-only storm systems.
		const cyclone = cyclone_roll(lat, lng, month, time_block);
		if (cyclone) return cyclone;

		if (abs_lat >= 68) return pick(polar_sea_season(season), seed);
		if (lat <= -40 && lat > -68) return pick(southern_ocean_outcomes, seed);
		if (in_box(grand_banks_box, lat, lng)) return pick(grand_banks_outcomes, seed);

		if (abs_lat >= 45) return pick(westerly_season(season), seed);
		if (abs_lat >= 9) return pick(trade_outcomes, seed);
		return pick(doldrum_outcomes, seed);
	}

	// ---- Land half ----

	// Ice caps: snow rules, but clear spells happen.
	if (abs_lat >= 70) return pick(ice_cap_season(season), seed);

	// Patagonia and the far southern tip.
	if (lat <= -40) return pick(patagonia_outcomes, seed);

	// Hot deserts before the monsoon boxes that border them.
	if (
		in_box(BOX.sahara_desert, lat, lng) ||
		in_box(BOX.arabian_desert, lat, lng) ||
		in_box(BOX.australian_outback, lat, lng)
	) {
		return land_pick(desert_month(month), seed, lat, lng, time_block);
	}

	// Regional climates, then latitude bands.
	if (in_box(BOX.west_africa, lat, lng)) return land_pick(west_africa_month(lat, month), seed, lat, lng, time_block);
	if (
		in_box(BOX.mediterranean_europe, lat, lng) ||
		in_box(BOX.california, lat, lng) ||
		in_box(BOX.central_chile, lat, lng) ||
		in_box(BOX.south_africa_tip, lat, lng) ||
		in_box(BOX.south_west_australia, lat, lng)
	) {
		return land_pick(mediterranean_season(season), seed, lat, lng, time_block);
	}
	if (in_box(BOX.amazon, lat, lng)) return land_pick(amazon_month(month), seed, lat, lng, time_block);
	if (in_box(BOX.north_australia, lat, lng)) return land_pick(north_australia_month(month), seed, lat, lng, time_block);
	if (in_box(BOX.bay_of_bengal, lat, lng)) return land_pick(bay_of_bengal_month(month), seed, lat, lng, time_block);
	if (in_box(BOX.south_asia, lat, lng)) return land_pick(south_asia_month(month), seed, lat, lng, time_block);
	if (in_box(BOX.mainland_sea, lat, lng)) return land_pick(mainland_sea_month(month), seed, lat, lng, time_block);
	if (in_box(BOX.maritime_sea, lat, lng)) return land_pick(maritime_sea_month(month), seed, lat, lng, time_block);
	if (in_box(BOX.east_asia, lat, lng)) return land_pick(east_asia_month(month), seed, lat, lng, time_block);

	// Latitude bands.
	if (abs_lat >= 60) return pick(subarctic_season(season), seed);
	if (abs_lat >= 45) return pick(continental_season(season), seed);
	if (abs_lat >= 23.5) return land_pick(subtropical_season(season), seed, lat, lng, time_block);

	// Tropics: rainforest near the equator, savanna toward the belts.
	return abs_lat <= 10
		? land_pick(rainforest_outcomes, seed, lat, lng, time_block)
		: land_pick(savanna_season(lat, month), seed, lat, lng, time_block);
}

/** Current UTC month index for climate lookups. */
export function current_month(): number {
	return new Date().getUTCMonth();
}

/**
 * Broad climate region for a point — drives regional weather-severity
 * overrides (Polar snow, Asian thunderstorms, ...). Coarse by design:
 *
 *   polar     |lat| ≥ 60            (subarctic winter counts as polar)
 *   asia      monsoon Asia         5–32°N, 60–150°E
 *   tropical  |lat| ≤ 23.5         (hurricane belt latitudes)
 *   temperate everything else
 */
export function region_for(lat: number, lng: number): RegionKey {
	if (Math.abs(lat) >= 60) return 'polar';
	if (lat >= 5 && lat <= 32 && lng >= 60 && lng <= 150) return 'asia';
	if (Math.abs(lat) <= 23.5) return 'tropical';
	return 'temperate';
}
