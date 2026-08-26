import { describe, it, expect } from 'vitest';
import {
	GRID_STEP_DEG,
	MAX_SAMPLES,
	viewport_step,
	viewport_sample_points,
	type ViewportBounds
} from './weather-grid';

const city: ViewportBounds = {
	min_lat: 11.52,
	max_lat: 11.58,
	min_lng: 104.9,
	max_lng: 104.96
};

const country: ViewportBounds = {
	min_lat: 10.0,
	max_lat: 20.0,
	min_lng: 100.0,
	max_lng: 110.0
};

const world: ViewportBounds = {
	min_lat: -85,
	max_lat: 85,
	min_lng: -180,
	max_lng: 180
};

describe('viewport_step', () => {
	it('never goes finer than the native grid resolution', () => {
		expect(viewport_step(city)).toBeGreaterThanOrEqual(GRID_STEP_DEG);
	});

	it('coarsens for world views so the sample budget holds', () => {
		expect(viewport_step(world)).toBeGreaterThan(GRID_STEP_DEG);
		expect(viewport_sample_points(world).length).toBeLessThanOrEqual(MAX_SAMPLES);
	});
});

describe('viewport_sample_points', () => {
	it('always returns at least one point, even for tiny viewports', () => {
		const points = viewport_sample_points({
			min_lat: 11.5564,
			max_lat: 11.5574,
			min_lng: 104.9282,
			max_lng: 104.9292
		});
		expect(points.length).toBeGreaterThanOrEqual(1);
	});

	it('keeps every point inside the requested bounds (lattice tolerance aside)', () => {
		for (const point of viewport_sample_points(country)) {
			expect(point.lat).toBeGreaterThanOrEqual(country.min_lat - GRID_STEP_DEG / 8);
			expect(point.lat).toBeLessThanOrEqual(country.max_lat + GRID_STEP_DEG / 8);
			expect(point.lng).toBeGreaterThanOrEqual(country.min_lng - GRID_STEP_DEG / 8);
			expect(point.lng).toBeLessThanOrEqual(country.max_lng + GRID_STEP_DEG / 8);
		}
	});

	it('covers a mid-size country with a useful number of samples', () => {
		const points = viewport_sample_points(country);
		expect(points.length).toBeGreaterThan(8);
		expect(points.length).toBeLessThanOrEqual(MAX_SAMPLES);
	});

	it('is stable while panning by less than one cell', () => {
		const before = viewport_sample_points({
			min_lat: 10,
			max_lat: 12,
			min_lng: 100,
			max_lng: 102
		});
		const after = viewport_sample_points({
			min_lat: 10.05,
			max_lat: 12.05,
			min_lng: 100.05,
			max_lng: 102.05
		});
		const keys = (list: { lat: number; lng: number }[]) =>
			new Set(list.map((p) => `${Math.round(p.lat * 4)},${Math.round(p.lng * 4)}`));
		const shared = [...keys(before)].filter((key) => keys(after).has(key));
		expect(shared.length).toBeGreaterThan(0);
	});
});
