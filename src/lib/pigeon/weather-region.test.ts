import { describe, it, expect } from 'vitest';
import {
	weather_effects,
	REGIONAL_MULTIPLIERS,
	WEATHER_VARIANTS,
	resolve_effect,
	describe_multiplier,
	type WeatherCondition
} from './weather';
import { region_for } from './weather-climate';

describe('regional weather-speed mechanic', () => {
	it('matches the spec baseline anchors', () => {
		expect(weather_effects.cloudy.speed_multiplier).toBe(0.97); // −3%
		expect(resolve_effect('rain', 'temperate').speed_multiplier).toBe(0.9); // −10%
		expect(resolve_effect('snow', 'temperate').speed_multiplier).toBe(0.88); // −12%
		expect(resolve_effect('heavy_rain', 'temperate').speed_multiplier).toBe(0.75); // −25%
	});

	it('matches the spec regional anchors', () => {
		expect(resolve_effect('snow', 'polar').speed_multiplier).toBe(0.7); // −30%
		expect(resolve_effect('thunderstorm', 'asia').speed_multiplier).toBe(0.6); // −40%
		expect(resolve_effect('blizzard', 'polar').speed_multiplier).toBe(0.25); // −75%
		expect(resolve_effect('hurricane', 'tropical').speed_multiplier).toBe(0.2); // −80%
	});

	it('keeps regional variants from overwriting each other or the base', () => {
		// Polar snow ≠ temperate snow; Asian thunderstorm ≠ base thunderstorm.
		expect(resolve_effect('snow', 'temperate').speed_multiplier).not.toBe(
			resolve_effect('snow', 'polar').speed_multiplier
		);
		expect(resolve_effect('thunderstorm', 'temperate').speed_multiplier).not.toBe(
			resolve_effect('thunderstorm', 'asia').speed_multiplier
		);
		// Untouched conditions keep their baseline everywhere.
		for (const region of ['temperate', 'tropical'] as const) {
			expect(resolve_effect('sandstorm', region)).toBe(weather_effects.sandstorm);
		}
	});

	it('labels regional variants so players can tell them apart', () => {
		expect(resolve_effect('blizzard', 'polar').label).toBe('Polar Blizzard');
		expect(resolve_effect('thunderstorm', 'asia').label).toBe('Asian Thunderstorm');
		expect(resolve_effect('snow', 'temperate').label).toBe('Snow');
	});

	it('keeps every variant multiplier unique so flights round-trip exactly', () => {
		const multipliers = WEATHER_VARIANTS.map((v) => v.effect.speed_multiplier);
		expect(new Set(multipliers).size).toBe(multipliers.length);

		for (const [condition, entries] of Object.entries(REGIONAL_MULTIPLIERS)) {
			for (const [variant_condition, multiplier] of Object.entries(entries)) {
				const decoded = describe_multiplier(multiplier as number);
				expect(decoded.condition).toBe(variant_condition as WeatherCondition);
				expect(decoded.region).toBe(condition);
			}
		}
	});

	it('classifies regions sensibly', () => {
		expect(region_for(-77, 166)).toBe('polar'); // McMurdo
		expect(region_for(11.5, 104.9)).toBe('asia'); // Phnom Penh
		expect(region_for(19, 72)).toBe('asia'); // Mumbai
		expect(region_for(18, -66)).toBe('tropical'); // Puerto Rico
		expect(region_for(51, 0)).toBe('temperate'); // London
	});
});
