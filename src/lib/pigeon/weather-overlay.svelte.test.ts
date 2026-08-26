import { describe, it, expect, vi, afterEach } from 'vitest';
import L from 'leaflet';
import { attach_weather_overlay } from './weather-overlay';

/**
 * Browser-mode reproduction: stub the fetch the overlay makes, mount a real
 * Leaflet map in chromium, and verify the legend plus zone visuals actually
 * land in the DOM. Catches "attaching… then nothing" bugs without a session.
 */

const fake_cells = {
	cells: [
		{ lat: 11.5, lng: 104.75, condition: 'rain', multiplier: 0.75, radius_m: 18000 },
		{ lat: 20, lng: 100, condition: 'thunderstorm', multiplier: 0.5, radius_m: 18000 },
		{ lat: 50, lng: 50, condition: 'clear', multiplier: 1, radius_m: 18000 }
	],
	sampled: 3,
	resolved: 3,
	server_now: Date.now()
};

function mount_map(): { host: HTMLDivElement; map: L.Map } {
	const host = document.createElement('div');
	host.style.cssText = 'position:fixed;inset:0;width:900px;height:700px;';
	document.body.appendChild(host);
	const map = L.map(host, { center: [11.5, 104.9], zoom: 4 });
	return { host, map };
}

describe('weather overlay', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
	});

	it('renders legend, circles and pills for non-clear cells', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(JSON.stringify(fake_cells), { status: 200 })
			)
		);

		const { host, map } = mount_map();
		const cleanup = attach_weather_overlay(map, L as unknown as typeof import('leaflet'));

		// Let the (stubbed) fetch and layer application settle.
		await new Promise((resolve) => setTimeout(resolve, 300));

		const legend = host.querySelector('.pigeon-weather-legend');
		expect(legend, 'legend dropdown should exist in the map container').toBeTruthy();

		const toggle = host.querySelector('.pigeon-weather-legend-toggle');
		expect(toggle).toBeTruthy();

		const rows = host.querySelectorAll('.pigeon-weather-legend-row');
		expect(rows.length).toBe(12);

		const status = legend?.querySelector('.pigeon-weather-legend-status');
		expect(status?.textContent).toContain('weather areas');

		// Main circles + storm core circles for non-clear cells.
		const circles = host.querySelectorAll('path.leaflet-interactive');
		expect(circles.length).toBeGreaterThanOrEqual(2);

		cleanup();
		map.remove();
	});

	it('removes the legend on cleanup', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(JSON.stringify(fake_cells), { status: 200 })
			)
		);

		const { host, map } = mount_map();
		const cleanup = attach_weather_overlay(map, L as unknown as typeof import('leaflet'));
		await new Promise((resolve) => setTimeout(resolve, 100));

		cleanup();
		map.remove();
		expect(host.querySelector('.pigeon-weather-legend')).toBeNull();
	});
});
