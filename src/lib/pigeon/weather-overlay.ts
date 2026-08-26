/**
 * Weather overlay for Leaflet maps.
 *
 * Renders one soft circle per sampled grid cell in the viewport, styled by
 * severity: faint gray clouds at the back, pulsing storms and hurricanes on
 * top. Data comes from the server's hourly cache and is refreshed whenever
 * the user pans or zooms (debounced, skipped when bounds did not change).
 *
 * A small legend chip doubles as a visibility toggle and reports status, so
 * an empty map ("everything clear here") is distinguishable from a broken
 * one ("weather unavailable").
 */

import { slowdown_percent, weather_effects, type WeatherCondition } from '$lib/pigeon/weather';

type LeafletModule = typeof import('leaflet');
type LeafletMap = import('leaflet').Map;
type LayerGroup = import('leaflet').LayerGroup;

type WeatherCell = {
	id?: string;
	name?: string;
	lat: number;
	lng: number;
	condition: WeatherCondition;
	multiplier: number;
	radius_m: number;
};

/** Paint order: background weather first, severe weather last (on top). */
const CONDITION_ORDER: WeatherCondition[] = [
	'cloudy',
	'windy',
	'haze',
	'fog',
	'drizzle',
	'rain',
	'snow',
	'sandstorm',
	'heavy_rain',
	'thunderstorm',
	'blizzard',
	'hurricane'
];

type CellStyle = {
	fill_opacity: number;
	/** Radius multiplier — allows adjacent cells to smoothly overlap and blend. */
	radius_scale: number;
	css_class: string;
};

const weather_icons: Record<WeatherCondition, string> = {
	clear: '☀️',
	cloudy: '☁️',
	windy: '💨',
	haze: '🌁',
	fog: '🌫️',
	drizzle: '🌦️',
	rain: '🌧️',
	heavy_rain: '⛈️',
	snow: '❄️',
	sandstorm: '🌪️',
	blizzard: '🌨️',
	thunderstorm: '⚡',
	hurricane: '🌀'
};

const CELL_STYLES: Partial<Record<WeatherCondition, CellStyle>> = {
	clear: { fill_opacity: 0, radius_scale: 1, css_class: '' },
	cloudy: { fill_opacity: 0.14, radius_scale: 1.0, css_class: 'pigeon-weather-cell--cloudy' },
	windy: { fill_opacity: 0.11, radius_scale: 1.0, css_class: '' },
	haze: { fill_opacity: 0.13, radius_scale: 1.0, css_class: '' },
	fog: { fill_opacity: 0.17, radius_scale: 1.0, css_class: 'pigeon-weather-cell--fog' },
	drizzle: { fill_opacity: 0.15, radius_scale: 1.0, css_class: '' },
	rain: { fill_opacity: 0.19, radius_scale: 1.0, css_class: '' },
	snow: { fill_opacity: 0.18, radius_scale: 1.0, css_class: 'pigeon-weather-cell--snow' },
	sandstorm: { fill_opacity: 0.19, radius_scale: 1.0, css_class: 'pigeon-weather-cell--fog' },
	heavy_rain: { fill_opacity: 0.22, radius_scale: 1.0, css_class: '' },
	thunderstorm: { fill_opacity: 0.25, radius_scale: 1.0, css_class: 'pigeon-weather-cell--storm' },
	blizzard: { fill_opacity: 0.24, radius_scale: 1.0, css_class: 'pigeon-weather-cell--storm' },
	hurricane: { fill_opacity: 0.3, radius_scale: 1.0, css_class: 'pigeon-weather-cell--hurricane' }
};

const STYLE_TAG_ID = 'pigeon-weather-overlay-styles';
const LEGEND_CLASS = 'pigeon-weather-legend';

const STYLES_CSS = `
.${LEGEND_CLASS} {
	position: absolute;
	left: 12px;
	bottom: 12px;
	z-index: 10000;
	font-family: inherit;
	user-select: none;
}
.${LEGEND_CLASS}-toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	background: rgba(255, 255, 255, 0.95);
	backdrop-filter: blur(8px);
	-webkit-backdrop-filter: blur(8px);
	border: 1px solid #cbd5e1;
	border-radius: 9999px;
	box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
	padding: 5px 12px;
	cursor: pointer;
	font-size: 11px;
	font-weight: 700;
	color: #1e293b;
	transition: all 0.15s ease;
}
.${LEGEND_CLASS}-toggle:hover {
	background: #ffffff;
	box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
	border-color: #94a3b8;
}
.${LEGEND_CLASS}-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	display: inline-block;
	flex-shrink: 0;
}
.${LEGEND_CLASS}-chevron {
	margin-left: 2px;
	font-size: 10px;
	color: #64748b;
	transition: transform 0.2s ease;
}
.${LEGEND_CLASS}.is-open .${LEGEND_CLASS}-chevron {
	transform: rotate(180deg);
}
.${LEGEND_CLASS}-dropdown {
	display: none;
	position: absolute;
	left: 0;
	bottom: calc(100% + 6px);
	width: 220px;
	max-height: 290px;
	background: rgba(255, 255, 255, 0.98);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border: 1px solid #e2e8f0;
	border-radius: 12px;
	box-shadow: 0 12px 28px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.04);
	padding: 8px 10px;
	flex-direction: column;
	gap: 4px;
	overflow-y: auto;
	animation: pigeon-wx-dropdown-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
.${LEGEND_CLASS}.is-open .${LEGEND_CLASS}-dropdown {
	display: flex;
}
@keyframes pigeon-wx-dropdown-in {
	from {
		opacity: 0;
		transform: translateY(6px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}
.${LEGEND_CLASS}-rows {
	display: flex;
	flex-direction: column;
	gap: 2px;
}
.${LEGEND_CLASS}-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 3px 6px;
	border-radius: 6px;
	font-size: 11px;
	color: #334155;
	transition: background 0.1s ease;
}
.${LEGEND_CLASS}-row.is-active {
	background: rgba(2, 132, 199, 0.09);
	font-weight: 600;
}
.${LEGEND_CLASS}-row-left {
	display: flex;
	align-items: center;
	gap: 6px;
}
.${LEGEND_CLASS}-impact {
	font-size: 10px;
	font-weight: 700;
	color: #64748b;
}
.${LEGEND_CLASS}-row.is-active .${LEGEND_CLASS}-impact {
	color: #0284c7;
}
.${LEGEND_CLASS}-count {
	font-size: 10px;
	font-weight: 700;
	color: #0284c7;
	margin-left: 4px;
}
.${LEGEND_CLASS}-status {
	margin-top: 5px;
	padding-top: 5px;
	border-top: 1px solid #f1f5f9;
	font-size: 9.5px;
	color: #64748b;
	line-height: 1.3;
}
.${LEGEND_CLASS}-status.is-error { color: #dc2626; }

.pigeon-weather-cell--snow { animation: pigeon-wx-shimmer 5s ease-in-out infinite; }
.pigeon-weather-cell--storm { animation: pigeon-wx-pulse 2.4s ease-in-out infinite; }
.pigeon-weather-cell--hurricane { animation: pigeon-wx-pulse 1.6s ease-in-out infinite; }
.pigeon-weather-cell--hurricane-ring {
	stroke-dasharray: 12 10;
	animation: pigeon-wx-spin 3.2s linear infinite;
}

@keyframes pigeon-wx-pulse {
	0%, 100% { opacity: 1; }
	50% { opacity: 0.45; }
}
@keyframes pigeon-wx-shimmer {
	0%, 100% { opacity: 0.9; }
	50% { opacity: 0.55; }
}
@keyframes pigeon-wx-spin {
	to { stroke-dashoffset: -44; }
}
`;

function ensure_styles(): void {
	if (typeof document === 'undefined') return;
	if (document.getElementById(STYLE_TAG_ID)) return;
	const tag = document.createElement('style');
	tag.id = STYLE_TAG_ID;
	tag.textContent = STYLES_CSS;
	document.head.appendChild(tag);
}

function build_legend(container: HTMLElement): {
	root: HTMLDivElement;
	status: HTMLDivElement;
	rows: Record<WeatherCondition, { row: HTMLDivElement; count: HTMLSpanElement }>;
	set_open: (open: boolean) => void;
} {
	const root = document.createElement('div');
	root.className = `${LEGEND_CLASS}`;

	const toggle = document.createElement('button');
	toggle.type = 'button';
	toggle.className = `${LEGEND_CLASS}-toggle`;
	toggle.innerHTML = `<span class="${LEGEND_CLASS}-dot" style="background:#0284c7"></span><span>Weather Legend</span><span class="${LEGEND_CLASS}-chevron">▾</span>`;
	root.appendChild(toggle);

	const dropdown = document.createElement('div');
	dropdown.className = `${LEGEND_CLASS}-dropdown`;
	root.appendChild(dropdown);

	const rows_wrap = document.createElement('div');
	rows_wrap.className = `${LEGEND_CLASS}-rows`;
	dropdown.appendChild(rows_wrap);

	const rows = {} as Record<WeatherCondition, { row: HTMLDivElement; count: HTMLSpanElement }>;
	for (const condition of CONDITION_ORDER) {
		const effect = weather_effects[condition];
		const icon = weather_icons[condition] ?? '☁️';
		const slowdown = slowdown_percent(effect.speed_multiplier);
		const row = document.createElement('div');
		row.className = `${LEGEND_CLASS}-row pigeon-weather-legend-row`;
		row.innerHTML = `
			<span class="${LEGEND_CLASS}-row-left">
				<span class="${LEGEND_CLASS}-dot" style="background:${effect.color};"></span>
				<span>${icon} ${effect.label}</span>
			</span>
			<span>
				<span class="${LEGEND_CLASS}-impact">−${slowdown}%</span>
				<span class="${LEGEND_CLASS}-count" data-count></span>
			</span>
		`;
		const count = row.querySelector('[data-count]') as HTMLSpanElement;
		rows[condition] = { row, count };
		rows_wrap.appendChild(row);
	}

	const status = document.createElement('div');
	status.className = `${LEGEND_CLASS}-status pigeon-weather-legend-status`;
	status.textContent = 'Loading…';
	dropdown.appendChild(status);

	// Regional note: baseline penalties shown above; harsh climates amplify.
	const regional_note = document.createElement('div');
	regional_note.className = `${LEGEND_CLASS}-status`;
	regional_note.textContent =
		'Polar & Asian storms hit harder than baseline — tap a circle for its exact penalty.';
	dropdown.appendChild(regional_note);

	let open = false;
	const set_open = (value: boolean) => {
		open = value;
		root.classList.toggle('is-open', open);
	};

	toggle.addEventListener('click', (e) => {
		e.stopPropagation();
		set_open(!open);
	});

	// Close dropdown when clicking outside
	const on_doc_click = (e: MouseEvent) => {
		if (open && !root.contains(e.target as Node)) {
			set_open(false);
		}
	};
	document.addEventListener('click', on_doc_click);

	container.appendChild(root);
	console.info('[Weather] legend dropdown added to map container');
	return { root, status, rows, set_open };
}

const WEATHER_PANE_NAME = 'pigeon-weather-pane';

/**
 * Attach the overlay. Returns a cleanup function that removes listeners,
 * layers and the legend chip.
 */
export function attach_weather_overlay(
	map: LeafletMap,
	leaflet_lib: LeafletModule
): () => void {
	console.info('[Weather] overlay attaching…');
	ensure_styles();

	let weather_pane = map.getPane(WEATHER_PANE_NAME);
	if (!weather_pane) {
		weather_pane = map.createPane(WEATHER_PANE_NAME);
		weather_pane.style.zIndex = '350';
		weather_pane.style.filter = 'blur(30px) saturate(1.15)';
		weather_pane.style.pointerEvents = 'auto';
		weather_pane.style.transition = 'opacity 0.25s ease';
	}
	// Applied every attach so restyles reach pre-existing panes too.
	weather_pane.style.opacity = '0.85';

	const container = map.getContainer();
	const legend = build_legend(container);
	let layer_group: LayerGroup | null = null;

	let generation = 0;
	let debounce_timer: ReturnType<typeof setTimeout> | null = null;
	let last_bounds_key = '';

	function set_status(text: string, is_error = false): void {
		legend.status.textContent = text;
		legend.status.classList.toggle('is-error', is_error);
	}

	function apply_layers(cells: WeatherCell[]): void {
		const next_group = leaflet_lib.layerGroup();
		const counts = {} as Record<WeatherCondition, number>;

		const ordered = [...cells].sort(
			(a, b) => CONDITION_ORDER.indexOf(a.condition) - CONDITION_ORDER.indexOf(b.condition)
		);

		for (const cell of ordered) {
			const style = CELL_STYLES[cell.condition];
			if (!style || style.fill_opacity <= 0) continue;
			counts[cell.condition] = (counts[cell.condition] ?? 0) + 1;

			const effect = weather_effects[cell.condition];
			// Circles are metric; stretch towards the poles so cells do not gap.
			const lat_stretch = 1 / Math.max(Math.abs(Math.cos((cell.lat * Math.PI) / 180)), 0.3);
			const radius = cell.radius_m * style.radius_scale * lat_stretch;

			// Severe weather core circle (subtle inner glow)
			if (cell.condition === 'hurricane' || cell.condition === 'thunderstorm' || cell.condition === 'blizzard') {
				next_group.addLayer(
					leaflet_lib.circle([cell.lat, cell.lng], {
						pane: WEATHER_PANE_NAME,
						radius: radius * 0.5,
						stroke: false,
						fillColor: effect.color,
						fillOpacity: 0.16,
						className: style.css_class
					})
				);
			}

			const circle = leaflet_lib.circle([cell.lat, cell.lng], {
				pane: WEATHER_PANE_NAME,
				radius,
				stroke: false,
				fillColor: effect.color,
				fillOpacity: style.fill_opacity,
				className: style.css_class
			});

			if (cell.condition !== 'clear') {
				// Tooltip must show the EXACT applied penalty — regional variants
				// (Polar Blizzard, Asian Thunderstorm) differ from the baseline.
				const slowdown = slowdown_percent(cell.multiplier);
				const icon = weather_icons[cell.condition] ?? '☁️';
				const speed_kmh = Math.round(80 * cell.multiplier);
				const title = cell.name ? cell.name : `${effect.label} Weather`;
				circle.bindTooltip(
					`<div style="text-align: center; line-height: 1.4; padding: 2px 4px;">
						<strong style="font-size: 12px;">${icon} ${title}</strong><br/>
						<span style="color: ${effect.color}; font-size: 11px; font-weight: 700;">Pigeon speed −${slowdown}%</span><br/>
						<span style="font-size: 10px; opacity: 0.75;">Cruise speed: ${speed_kmh} km/h</span>
					</div>`,
					{
						sticky: true,
						opacity: 0.95
					}
				);
			}

			next_group.addLayer(circle);
		}

		for (const condition of CONDITION_ORDER) {
			const count = counts[condition] ?? 0;
			const item = legend.rows[condition];
			if (item) {
				item.count.textContent = count > 0 ? `×${count}` : '';
				item.row.classList.toggle('is-active', count > 0);
			}
		}

		// Crossfade: paint the new group first, then drop the old one.
		const previous = layer_group;
		layer_group = next_group.addTo(map);
		if (previous) previous.remove();
	}

	let latest_rendered_generation = 0;
	let abort_controller: AbortController | null = null;

	async function refresh(): Promise<void> {
		const request_generation = ++generation;

		const bounds = map.getBounds();
		const bounds_key = [
			bounds.getSouth(),
			bounds.getWest(),
			bounds.getNorth(),
			bounds.getEast()
		]
			.map((value) => value.toFixed(3))
			.join(',');
		if (bounds_key === last_bounds_key && latest_rendered_generation > 0) return;

		const params = new URLSearchParams({
			min_lat: String(bounds.getSouth()),
			max_lat: String(bounds.getNorth()),
			min_lng: String(bounds.getWest()),
			max_lng: String(bounds.getEast())
		});

		if (abort_controller) abort_controller.abort();
		abort_controller = new AbortController();

		try {
			const response = await fetch(`/api/pigeon/weather?${params.toString()}`, {
				signal: abort_controller.signal
			});
			console.info(`[Weather] response status: ${response.status}`);
			if (!response.ok) throw new Error(`status ${response.status}`);

			const payload = (await response.json()) as {
				cells: WeatherCell[];
				sampled: number;
				resolved: number;
				server_now: number;
			};
			if (request_generation <= latest_rendered_generation) return;

			latest_rendered_generation = request_generation;
			last_bounds_key = bounds_key;

			apply_layers(payload.cells);

			const shown = payload.cells.filter(
				(cell) => cell.condition !== 'clear'
			).length;
			const updated = new Date(payload.server_now).toLocaleTimeString([], {
				hour: '2-digit',
				minute: '2-digit'
			});
			set_status(`${shown} weather areas · ${payload.resolved}/${payload.sampled} cells · ${updated}`);
			console.info(
				`[Weather] ${payload.cells.length} cells (${shown} non-clear) in view`
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			console.warn('[Weather] fetch failed:', error);
			if (request_generation >= generation) {
				set_status('Weather unavailable', true);
			}
		}
	}

	function schedule_refresh(): void {
		if (debounce_timer) clearTimeout(debounce_timer);
		debounce_timer = setTimeout(() => {
			void refresh();
		}, 300);
	}

	map.on('moveend', schedule_refresh);
	void refresh();

	return () => {
		generation += 1;
		if (debounce_timer) clearTimeout(debounce_timer);
		if (abort_controller) abort_controller.abort();
		map.off('moveend', schedule_refresh);
		if (layer_group) layer_group.remove();
		legend.root.remove();
	};
}
