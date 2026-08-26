import { describe, it, expect } from 'vitest';
import { climate_condition, peak_convective_block } from './weather-climate';
import { is_land } from './land-mask';
import { weather_effects, type WeatherCondition } from './weather';

const ALL_CONDITIONS: WeatherCondition[] = [
	'clear', 'cloudy', 'windy', 'haze', 'fog', 'drizzle', 'rain',
	'heavy_rain', 'snow', 'sandstorm', 'blizzard', 'thunderstorm', 'hurricane'
];

const BLOCKS = [0, 1, 2, 3];

describe('weather_effects table', () => {
	it('keeps multipliers unique so flights can round-trip to conditions', () => {
		const multipliers = Object.values(weather_effects).map((e) => e.speed_multiplier);
		expect(new Set(multipliers).size).toBe(multipliers.length);
	});

	it('covers every condition with a label and colour', () => {
		for (const condition of ALL_CONDITIONS) {
			const effect = weather_effects[condition];
			expect(effect.label.length).toBeGreaterThan(0);
			expect(effect.color.startsWith('#')).toBe(true);
			expect(effect.speed_multiplier).toBeGreaterThan(0);
			expect(effect.speed_multiplier).toBeLessThanOrEqual(1);
		}
	});
});

describe('climate_condition', () => {
	it('is deterministic for identical inputs', () => {
		const first = climate_condition(11.5564, 104.9282, 6, 1);
		const second = climate_condition(11.5564, 104.9282, 6, 1);
		expect(first).toBe(second);
	});

	it('keeps the deep polar caps snow-dominated year-round', () => {
		let snowy = 0;
		let cells = 0;
		for (const lat of [-80, -70, 75]) {
			for (const lng of [40, -60, 60]) {
				for (const month of [0, 3, 6, 9]) {
					for (const block of BLOCKS) {
						cells += 1;
						if (['snow', 'blizzard'].includes(climate_condition(lat, lng, month, block))) {
							snowy += 1;
						}
					}
				}
			}
		}
		expect(snowy / cells).toBeGreaterThan(0.5);
	});

	it('makes Siberia mostly snow in January', () => {
		let cells = 0;
		let snowy = 0;
		for (let lat = 50; lat <= 65; lat += 3) {
			for (let lng = 60; lng <= 140; lng += 8) {
				cells += 1;
				if (climate_condition(lat, lng, 0, 1) === 'snow') snowy += 1;
			}
		}
		expect(cells).toBeGreaterThan(20);
		expect(snowy / cells).toBeGreaterThan(0.35);
	});

	it('drowns Cambodia in the southwest monsoon (July)', () => {
		const wet = new Set<WeatherCondition>(['rain', 'heavy_rain', 'thunderstorm', 'cloudy']);
		let wet_cells = 0;
		let total = 0;
		for (let lat = 10.5; lat <= 14; lat += 1.5) {
			for (let lng = 103; lng <= 106; lng += 1.5) {
				for (const block of BLOCKS) {
					total += 1;
					if (wet.has(climate_condition(lat, lng, 6, block))) wet_cells += 1;
				}
			}
		}
		expect(wet_cells / total).toBeGreaterThan(0.6);
	});

	it('smokes out mainland SEA during burn season (March)', () => {
		let hazy = 0;
		let cells = 0;
		for (let lat = 10; lat <= 26; lat += 2) {
			for (let lng = 94; lng <= 108; lng += 2) {
				cells += 1;
				if (climate_condition(lat, lng, 2, 1) === 'haze') hazy += 1;
			}
		}
		expect(hazy / cells).toBeGreaterThan(0.15);
	});

	it('bakes the Sahara in July but raises Harmattan dust in January', () => {
		// July: desert stays dry — no precipitation, no severe dust.
		for (let lng = -10; lng <= 25; lng += 5) {
			for (const block of BLOCKS) {
				const condition = climate_condition(23, lng, 6, block);
				expect(['clear', 'cloudy', 'windy']).toContain(condition);
			}
		}

		// January Sahel: Harmattan dust shows up.
		const outcomes = new Set<WeatherCondition>();
		for (let lat = 13; lat <= 19; lat += 1) {
			for (let lng = -10; lng <= 20; lng += 4) {
				outcomes.add(climate_condition(lat, lng, 0, 1));
			}
		}
		expect(outcomes.has('haze') || outcomes.has('sandstorm')).toBe(true);
	});

	it('keeps the Mediterranean land dry in summer, wet in winter', () => {
		let summer_clearish = 0;
		let winter_wet = 0;
		let cells = 0;
		for (let lat = 33; lat <= 45; lat += 2) {
			for (let lng = -8; lng <= 32; lng += 4) {
				if (!is_land(lat, lng)) continue; // sea cells follow marine regimes
				cells += 1;
				if (['clear', 'windy'].includes(climate_condition(lat, lng, 6, 1))) summer_clearish += 1;
				if (['rain', 'drizzle', 'cloudy'].includes(climate_condition(lat, lng, 0, 1))) winter_wet += 1;
			}
		}
		expect(cells).toBeGreaterThan(10);
		expect(summer_clearish / cells).toBeGreaterThan(0.7);
		expect(winter_wet / cells).toBeGreaterThan(0.5);
	});

	it('blows near-constant gales in the Roaring Forties', () => {
		let windy = 0;
		let cells = 0;
		for (let lng = -180; lng <= 180; lng += 12) {
			cells += 1;
			if (climate_condition(-50, lng, 3, 1) === 'windy') windy += 1;
		}
		expect(windy / cells).toBeGreaterThan(0.45);
	});

	it('keeps mid-ocean trade belts flyable almost everywhere', () => {
		const benign = new Set<WeatherCondition>(['clear', 'cloudy', 'windy', 'drizzle']);
		let benign_cells = 0;
		let total = 0;
		for (let lng = -170; lng <= -150; lng += 5) {
			for (const block of BLOCKS) {
				total += 1;
				if (benign.has(climate_condition(25, lng, 6, block))) benign_cells += 1;
			}
		}
		expect(benign_cells / total).toBeGreaterThan(0.8);
	});

	it('spawns rare discrete hurricanes in Atlantic peak but none in December or on land', () => {
		let september_storms = 0;
		for (const block of BLOCKS) {
			for (let lat = 10; lat <= 38; lat += 2) {
				for (let lng = -90; lng <= -20; lng += 4) {
					if (climate_condition(lat, lng, 8, block) === 'hurricane') september_storms += 1;
				}
			}
		}
		expect(september_storms).toBeGreaterThan(0);

		for (const block of BLOCKS) {
			for (let lat = 10; lat <= 35; lat += 2.5) {
				for (let lng = -90; lng <= -20; lng += 5) {
					expect(climate_condition(lat, lng, 11, block)).not.toBe('hurricane');
				}
			}
		}

		// Cyclones never sit on land — Miami stays cyclone-free.
		for (const block of BLOCKS) {
			expect(climate_condition(25.8, -80.2, 8, block)).not.toBe('hurricane');
		}
	});

	it('gives the Bay of Bengal its double cyclone peaks (May & November)', () => {
		const stormy = (month: number): number => {
			let storms = 0;
			for (const block of BLOCKS) {
				for (let lat = 6; lat <= 22; lat += 2) {
					for (let lng = 82; lng <= 94; lng += 2) {
						if (climate_condition(lat, lng, month, block) === 'hurricane') storms += 1;
					}
				}
			}
			return storms;
		};
		expect(stormy(4)).toBeGreaterThan(0);
		expect(stormy(10)).toBeGreaterThan(0);
		expect(stormy(1)).toBe(0);
	});

	it('keeps the Amazon wetter in February than September', () => {
		const wet_share = (month: number): number => {
			let wet = 0;
			let cells = 0;
			for (let lat = -10; lat <= 2; lat += 2) {
				for (let lng = -70; lng <= -50; lng += 3) {
					cells += 1;
					if (['rain', 'heavy_rain', 'thunderstorm'].includes(climate_condition(lat, lng, month, 1))) {
						wet += 1;
					}
				}
			}
			return wet / cells;
		};
		expect(wet_share(1)).toBeGreaterThan(wet_share(8));
	});

	it('peaks land thunderstorms at local afternoon, not deep night', () => {
		let afternoon = 0;
		let night = 0;
		for (let lat = -5; lat <= 5; lat += 2.5) {
			for (let lng = 12; lng <= 27; lng += 3) {
				const peak = peak_convective_block(lng);
				if (climate_condition(lat, lng, 7, peak) === 'thunderstorm') afternoon += 1;
				if (climate_condition(lat, lng, 7, (peak + 2) % 4) === 'thunderstorm') night += 1;
			}
		}
		expect(afternoon).toBeGreaterThan(night * 2);
	});

	it('never returns an unknown condition anywhere on the globe', () => {
		for (let lat = -85; lat <= 85; lat += 15) {
			for (let lng = -180; lng <= 180; lng += 30) {
				for (const month of [0, 5, 9]) {
					for (const block of [0, 2]) {
						expect(ALL_CONDITIONS).toContain(climate_condition(lat, lng, month, block));
					}
				}
			}
		}
	});
});
