import { describe, it, expect } from 'vitest';
import { is_land } from './land-mask';

describe('land mask', () => {
	it('recognises major landmasses', () => {
		const land_points: Array<[number, number]> = [
			[11.5564, 104.9282], // Phnom Penh
			[23, 10], // Central Sahara
			[38, -98], // Kansas
			[-3, -60], // Amazon
			[62, 100], // Siberia
			[-25, 134], // Australian outback
			[35.7, 139.7], // Tokyo
			[20, 78], // India
			[9, 8], // Nigeria
			[-75, 0] // Antarctica
		];
		for (const [lat, lng] of land_points) {
			expect(is_land(lat, lng), `expected land at ${lat},${lng}`).toBe(true);
		}
	});

	it('recognises open water', () => {
		const water_points: Array<[number, number]> = [
			[0, -140], // Mid-Pacific
			[30, -45], // Mid-Atlantic
			[-20, 75], // Indian Ocean
			[35, 18], // Mediterranean
			[20, 38], // Red Sea
			[15, 88], // Bay of Bengal
			[27, 51] // Persian Gulf
		];
		for (const [lat, lng] of water_points) {
			expect(is_land(lat, lng), `expected water at ${lat},${lng}`).toBe(false);
		}
	});

	it('is deterministic for repeated queries', () => {
		expect(is_land(48.85, 2.35)).toBe(is_land(48.85, 2.35));
	});
});
