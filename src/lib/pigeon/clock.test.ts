import { describe, it, expect } from 'vitest';
import {
	clock_offset_from,
	epoch_from_sql,
	format_distance,
	format_duration,
	format_eta
} from './clock';

describe('epoch_from_sql', () => {
	it('parses the servers UTC format', () => {
		expect(epoch_from_sql('2026-01-02 03:04:05.678')).toBe(Date.UTC(2026, 0, 2, 3, 4, 5, 678));
	});

	it('treats the value as UTC, not local time', () => {
		// The stored string carries no Z, so a naive parse would shift by the
		// browser timezone and skew every ETA by hours.
		const parsed = epoch_from_sql('2026-01-02 00:00:00.000');

		expect(new Date(parsed as number).toISOString()).toBe('2026-01-02T00:00:00.000Z');
	});

	it('returns null for missing or unparseable input', () => {
		expect(epoch_from_sql(null)).toBeNull();
		expect(epoch_from_sql('')).toBeNull();
		expect(epoch_from_sql('not a timestamp')).toBeNull();
	});
});

describe('clock_offset_from', () => {
	it('is roughly zero when the clocks agree', () => {
		expect(Math.abs(clock_offset_from(Date.now()))).toBeLessThan(1000);
	});

	it('is positive when the browser clock is behind', () => {
		expect(clock_offset_from(Date.now() + 600_000)).toBeGreaterThan(500_000);
	});

	it('falls back to no correction when the server time is missing', () => {
		expect(clock_offset_from(null)).toBe(0);
		expect(clock_offset_from(Number.NaN)).toBe(0);
	});
});

describe('format_duration', () => {
	it('never shows seconds, which would imply false precision', () => {
		expect(format_duration(30_000)).toBe('under a minute');
	});

	it('shows minutes under an hour', () => {
		expect(format_duration(45 * 60_000)).toBe('45m');
	});

	it('shows hours and minutes under a day', () => {
		expect(format_duration(6 * 3_600_000 + 20 * 60_000)).toBe('6h 20m');
	});

	it('drops the minutes on a whole number of hours', () => {
		expect(format_duration(6 * 3_600_000)).toBe('6h');
	});

	it('shows days and hours for a long haul', () => {
		// Phnom Penh to London at 80 km/h.
		expect(format_duration(5 * 86_400_000 + 3 * 3_600_000)).toBe('5d 3h');
	});

	it('drops the hours on a whole number of days', () => {
		expect(format_duration(10 * 86_400_000)).toBe('10d');
	});

	it('collapses a past duration to now', () => {
		expect(format_duration(-5000)).toBe('now');
	});
});

describe('format_eta', () => {
	it('describes a future arrival', () => {
		expect(format_eta(1_000_000_000 + 2 * 86_400_000, 1_000_000_000)).toBe('arrives in 2d');
	});

	it('reports a past arrival as arrived', () => {
		expect(format_eta(1_000_000_000, 1_000_000_001)).toBe('arrived');
	});

	it('is empty when there is nothing to time', () => {
		expect(format_eta(null, Date.now())).toBe('');
	});
});

describe('format_distance', () => {
	it('groups thousands', () => {
		expect(format_distance(4350.4)).toBe('4,350 km');
	});

	it('keeps one decimal for very short hops', () => {
		expect(format_distance(2.34)).toBe('2.3 km');
	});

	it('is empty when there is no distance', () => {
		expect(format_distance(null)).toBe('');
	});
});
