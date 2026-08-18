<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import {
		position_at,
		progress_at,
		route_total_km,
		flight_ms_for_km,
		haversine_km,
		interpolate_leg,
		delivery_schedule,
		type RouteLeg,
		type Coords
	} from '$lib/pigeon/flight';
	import { format_duration, format_distance } from '$lib/pigeon/clock';
	import {
		Maximize2,
		X,
		RotateCcw,
		Crosshair,
		Bird,
		Navigation,
		AlertTriangle
	} from 'lucide-svelte';
	import 'leaflet/dist/leaflet.css';

	export type FlightItem = {
		id?: string;
		route: RouteLeg[];
		departed_at: number;
		status?: string; // 'in_flight' | 'recalled' | 'delivered'
		recalled_at?: number | null;
		label?: string;
	};

	type Props = {
		/** Single route (backwards compatible) */
		route?: RouteLeg[];
		departed_at?: number;
		flight_id?: string;
		status?: string;
		recalled_at?: number | null;
		/** Multi-flight array */
		flights?: FlightItem[];
		/** Difference between server clock and browser clock */
		clock_offset?: number;
		/** Loft display names keyed by recipient id */
		labels?: Record<string, string>;
		/** Sender loft label */
		origin_label?: string;
		compact?: boolean;
		on_recall?: (flight_id: string) => Promise<void> | void;
	};

	const {
		route,
		departed_at,
		flight_id,
		status = 'in_flight',
		recalled_at = null,
		flights,
		clock_offset = 0,
		labels = {},
		origin_label = 'Your loft',
		compact = false,
		on_recall
	}: Props = $props();

	// Normalize normalized flight items
	const all_flights = $derived.by<FlightItem[]>(() => {
		if (flights && flights.length > 0) {
			return flights;
		}
		if (route && departed_at !== undefined) {
			return [
				{
					id: flight_id,
					route,
					departed_at,
					status,
					recalled_at,
					label: 'Current Flight'
				}
			];
		}
		return [];
	});

	let selected_flight_idx = $state(0);
	let is_fullscreen = $state(false);
	let show_recall_confirm = $state(false);
	let is_recalling = $state(false);
	let recall_error = $state<string | null>(null);

	let map_element: HTMLDivElement | null = $state(null);
	let now = $state(Date.now());

	let leaflet_module = $state<typeof import('leaflet') | null>(null);
	let map_instance = $state<import('leaflet').Map | null>(null);

	// Leaflet layer collections per flight
	type FlightLayers = {
		flown_line: import('leaflet').Polyline;
		remaining_line: import('leaflet').Polyline;
		pigeon_marker: import('leaflet').Marker;
	};

	const flight_layers = new SvelteMap<number, FlightLayers>();
	let loft_markers: import('leaflet').Marker[] = [];

	const active_selected_flight = $derived(
		all_flights[selected_flight_idx] ?? all_flights[0] ?? null
	);

	const server_now = $derived(now + clock_offset);

	// Waypoints gathered across all active flights
	const all_display_waypoints = $derived.by(() => {
		if (all_flights.length === 0) return [];
		const first_route = all_flights[0].route;
		if (!first_route || first_route.length === 0) return [];

		const origin = { ...first_route[0].from };
		const waypoints: { id: string; coords: Coords; label: string; is_origin: boolean }[] = [
			{ id: 'origin', coords: origin, label: origin_label, is_origin: true }
		];

		const seen_recipients = new SvelteSet<string>();

		for (const fl of all_flights) {
			fl.route.forEach((leg, index) => {
				if (!leg.recipient_id) return;
				if (seen_recipients.has(leg.recipient_id)) return;
				seen_recipients.add(leg.recipient_id);

				let dest = { ...leg.to };
				if (
					Math.abs(dest.lat - origin.lat) < 0.0001 &&
					Math.abs(dest.lng - origin.lng) < 0.0001
				) {
					dest = {
						lat: origin.lat + 0.0018,
						lng: origin.lng + 0.0028
					};
				}

				waypoints.push({
					id: leg.recipient_id,
					coords: dest,
					label: labels[leg.recipient_id] ?? `Recipient ${index + 1}`,
					is_origin: false
				});
			});
		}

		return waypoints;
	});

	// Per-flight computed dynamics
	type FlightDynamic = {
		flight: FlightItem;
		pigeon_coords: Coords;
		heading: number;
		progress: number;
		is_recalled: boolean;
		is_delivered: boolean;
		is_returned_home: boolean;
		status_title: string;
		formatted_distance: string;
		formatted_eta: string;
		flown_points: [number, number][];
		remaining_points: [number, number][];
	};

	function compute_recalled_flight_dynamic(
		fl: FlightItem,
		origin: Coords,
		server_time: number
	): FlightDynamic {
		const recall_time = fl.recalled_at ?? server_time;
		const recall_snapshot = position_at(fl.route, fl.departed_at, recall_time);
		const recall_origin = recall_snapshot.coords;
		const return_km = haversine_km(recall_origin, origin);
		const return_total_ms = flight_ms_for_km(return_km);
		const elapsed_return_ms = Math.max(0, server_time - recall_time);

		const return_fraction =
			return_total_ms <= 0 ? 1 : Math.min(1, elapsed_return_ms / return_total_ms);
		const pigeon_coords = interpolate_leg(recall_origin, origin, return_fraction);
		const is_returned_home = return_fraction >= 1;

		const d_lng = origin.lng - recall_origin.lng;
		const d_lat = origin.lat - recall_origin.lat;
		const heading = (Math.atan2(d_lng, d_lat) * 180) / Math.PI;

		const remaining_ms = Math.max(0, return_total_ms - elapsed_return_ms);
		const status_title = is_returned_home
			? 'Pigeon Returned Home'
			: `Pigeon Returning (${Math.round(return_fraction * 100)}%)`;
		const formatted_eta = is_returned_home
			? 'Returned'
			: `Returning in ${format_duration(remaining_ms)}`;

		return {
			flight: fl,
			pigeon_coords,
			heading,
			progress: return_fraction,
			is_recalled: true,
			is_delivered: false,
			is_returned_home,
			status_title,
			formatted_distance: format_distance(return_km),
			formatted_eta,
			flown_points: [
				[recall_origin.lat, recall_origin.lng],
				[pigeon_coords.lat, pigeon_coords.lng]
			],
			remaining_points: [
				[pigeon_coords.lat, pigeon_coords.lng],
				[origin.lat, origin.lng]
			]
		};
	}

	function compute_outbound_flight_dynamic(
		fl: FlightItem,
		server_time: number,
		loft_labels: Record<string, string>
	): FlightDynamic {
		const route = fl.route;
		const total_km = route_total_km(route);
		const schedule = delivery_schedule(route, fl.departed_at);
		const next_pending_stop = schedule.find((s) => s.deliver_at > server_time);
		const total_round_trip_ms = flight_ms_for_km(total_km);
		const available_at_ms = fl.departed_at + total_round_trip_ms;

		const is_delivered = !next_pending_stop;
		const is_returned_home = server_time >= available_at_ms;

		const current_pos = position_at(route, fl.departed_at, server_time);
		const pigeon_coords = current_pos.coords;

		const leg = route[current_pos.leg_index] ?? route[0];
		let heading = 0;
		if (leg) {
			const d_lng = leg.to.lng - leg.from.lng;
			const d_lat = leg.to.lat - leg.from.lat;
			heading = (Math.atan2(d_lng, d_lat) * 180) / Math.PI;
		}

		let progress = 0;
		let formatted_eta = '';
		let status_title = '';
		let formatted_distance = '';

		if (!is_delivered && next_pending_stop) {
			const remaining_to_deliver_ms = Math.max(0, next_pending_stop.deliver_at - server_time);
			const total_leg_ms = flight_ms_for_km(next_pending_stop.distance_km);
			const elapsed_ms = Math.max(0, server_time - fl.departed_at);
			progress = total_leg_ms <= 0 ? 1 : Math.min(1, elapsed_ms / total_leg_ms);

			const recipient_label = loft_labels[next_pending_stop.recipient_id] ?? 'recipient';
			const duration_str = format_duration(remaining_to_deliver_ms);
			formatted_eta = duration_str === 'now' ? 'Landing now' : `reaches ${recipient_label} in ${duration_str}`;
			status_title = `In Flight (${Math.round(progress * 100)}%)`;
			formatted_distance = format_distance(next_pending_stop.distance_km);
		} else if (!is_returned_home) {
			const remaining_return_ms = Math.max(0, available_at_ms - server_time);
			progress = progress_at(route, fl.departed_at, server_time);
			const return_dur_str = format_duration(remaining_return_ms);
			formatted_eta = `Delivered · in loft in ${return_dur_str}`;
			status_title = `Delivered · Returning (${Math.round(progress * 100)}%)`;
			formatted_distance = format_distance(total_km);
		} else {
			progress = 1;
			formatted_eta = 'Delivered';
			status_title = 'Pigeon Landed in Loft';
			formatted_distance = format_distance(total_km);
		}

		const passed_points: [number, number][] = [];
		for (let i = 0; i <= current_pos.leg_index && i < route.length; i++) {
			passed_points.push([route[i].from.lat, route[i].from.lng]);
		}
		passed_points.push([pigeon_coords.lat, pigeon_coords.lng]);

		const future_points: [number, number][] = [[pigeon_coords.lat, pigeon_coords.lng]];
		if (leg) future_points.push([leg.to.lat, leg.to.lng]);
		for (let i = current_pos.leg_index + 1; i < route.length; i++) {
			future_points.push([route[i].to.lat, route[i].to.lng]);
		}

		return {
			flight: fl,
			pigeon_coords,
			heading,
			progress,
			is_recalled: false,
			is_delivered,
			is_returned_home,
			status_title,
			formatted_distance,
			formatted_eta,
			flown_points: passed_points,
			remaining_points: future_points
		};
	}

	const flights_dynamics = $derived.by<FlightDynamic[]>(() => {
		return all_flights.map((fl) => {
			if (!fl.route || fl.route.length === 0) {
				return {
					flight: fl,
					pigeon_coords: { lat: 0, lng: 0 },
					heading: 0,
					progress: 1,
					is_recalled: false,
					is_delivered: true,
					is_returned_home: true,
					status_title: 'Delivered',
					formatted_distance: '0 km',
					formatted_eta: 'Delivered',
					flown_points: [],
					remaining_points: []
				};
			}

			const origin = fl.route[0].from;
			if (fl.status === 'recalled' && typeof fl.recalled_at === 'number') {
				return compute_recalled_flight_dynamic(fl, origin, server_now);
			}

			return compute_outbound_flight_dynamic(fl, server_now, labels);
		});
	});

	const active_dynamic = $derived(
		flights_dynamics[selected_flight_idx] ?? flights_dynamics[0] ?? null
	);

	// Palette for multiple pigeons
	const flight_colors = [
		{ stroke: '#0284c7', glow: 'rgba(2, 132, 199, 0.28)', dot: '#0284c7', fill: '#38bdf8' },
		{ stroke: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.28)', dot: '#8b5cf6', fill: '#a78bfa' },
		{ stroke: '#059669', glow: 'rgba(5, 150, 105, 0.28)', dot: '#059669', fill: '#34d399' },
		{ stroke: '#d97706', glow: 'rgba(217, 119, 6, 0.28)', dot: '#d97706', fill: '#fbbf24' }
	];

	// Animation frame loop
	onMount(() => {
		let frame = 0;
		const tick = () => {
			now = Date.now();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		import('leaflet').then((mod) => {
			leaflet_module = mod.default || mod;
		});

		const on_key_down = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && is_fullscreen) {
				toggle_fullscreen();
			}
		};
		window.addEventListener('keydown', on_key_down);

		return () => {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener('keydown', on_key_down);
		};
	});

	// Initialize Leaflet Map
	$effect(() => {
		if (!browser || !map_element || !leaflet_module || map_instance) return;

		const leaflet_lib = leaflet_module;
		const map = leaflet_lib.map(map_element, {
			zoomControl: false,
			attributionControl: false,
			scrollWheelZoom: true,
			touchZoom: true
		});

		leaflet_lib.tileLayer(
			'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
			{
				maxZoom: 19,
				subdomains: 'abcd'
			}
		).addTo(map);

		leaflet_lib.control.zoom({ position: 'topright' }).addTo(map);
		map_instance = map;

		build_all_layers(leaflet_lib, map);

		return () => {
			if (map_instance) {
				map_instance.remove();
				map_instance = null;
			}
			flight_layers.clear();
			loft_markers = [];
		};
	});

	function build_all_layers(leaflet_lib: typeof import('leaflet'), map: import('leaflet').Map) {
		loft_markers.forEach((m) => m.remove());
		loft_markers = [];

		all_display_waypoints.forEach((wp) => {
			const icon_html = `
				<div class="loft-marker-wrapper ${wp.is_origin ? 'loft-marker--origin' : 'loft-marker--dest'}">
					<div class="loft-marker-badge">
						<span class="loft-badge-icon">${wp.is_origin ? '🏠' : '🎯'}</span>
						<span class="loft-badge-text">${wp.label}</span>
					</div>
					<div class="loft-marker-dot"></div>
				</div>
			`;

			const marker_icon = leaflet_lib.divIcon({
				className: 'leaflet-zero-icon',
				html: icon_html,
				iconSize: [0, 0],
				iconAnchor: [0, 0]
			});

			const marker = leaflet_lib.marker([wp.coords.lat, wp.coords.lng], { icon: marker_icon }).addTo(map);
			loft_markers.push(marker);
		});

		flight_layers.forEach((fl) => {
			fl.flown_line.remove();
			fl.remaining_line.remove();
			fl.pigeon_marker.remove();
		});
		flight_layers.clear();

		flights_dynamics.forEach((dyn, idx) => {
			const color = dyn.is_recalled
				? { stroke: '#ea580c', glow: 'rgba(234, 88, 12, 0.35)', dot: '#ea580c', fill: '#f97316' }
				: flight_colors[idx % flight_colors.length];

			const flown = leaflet_lib.polyline(dyn.flown_points, {
				color: color.stroke,
				weight: 4.5,
				opacity: 0.95,
				lineCap: 'round',
				lineJoin: 'round'
			}).addTo(map);

			const remaining = leaflet_lib.polyline(dyn.remaining_points, {
				color: dyn.is_recalled ? '#fdba74' : '#94a3b8',
				weight: 3,
				opacity: 0.8,
				dashArray: '6, 8',
				lineCap: 'round',
				lineJoin: 'round'
			}).addTo(map);

			const pigeon_html = `
				<div class="pigeon-marker-wrapper" style="transform: rotate(${dyn.heading - 45}deg);">
					<div class="pigeon-radar-glow" style="background: ${color.glow};"></div>
					<div class="pigeon-bird-icon ${dyn.is_recalled ? 'pigeon-bird-icon--recalled' : ''}">
						<svg viewBox="0 0 15 15" width="32" height="32" style="overflow: visible;">
							<path d="M0 0h15v15H0z" fill="none" />
							<path fill="${color.stroke}" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round" d="m1.63 11.24l4.26-3.2q-.93-.39-1.2-.66c-.27-.27-.35-2.13-.53-3.2l-.11-.07C3.16 3.46-.35.43.03.05c.4-.4 5.59 1.6 6.26 2.27c.44.44.84 1.28 1.2 2.53c.91-.25 1.51-.5 1.8-.74l.06-.06c.27-.27.8-.45 1.6-.53l1.33-.8l-.8 1.33c-.08.73-.23 1.24-.46 1.52l-.07.08c-.26.26-.53.88-.8 1.86c1.25.36 2.09.76 2.53 1.2c.67.67 2.67 5.86 2.27 6.26s-3.71-3.48-4.13-4.13c-1.07-.18-2.93-.26-3.2-.53q-.27-.27-.66-1.2l-3.2 4.26c-.71 0-1.24-.17-1.6-.53s-.53-.89-.53-1.6" />
						</svg>
					</div>
				</div>
			`;

			const p_icon = leaflet_lib.divIcon({
				className: 'leaflet-zero-icon',
				html: pigeon_html,
				iconSize: [0, 0],
				iconAnchor: [0, 0]
			});

			const p_marker = leaflet_lib.marker([dyn.pigeon_coords.lat, dyn.pigeon_coords.lng], {
				icon: p_icon,
				zIndexOffset: 100 + idx
			}).addTo(map);

			p_marker.on('click', () => {
				selected_flight_idx = idx;
			});

			flight_layers.set(idx, {
				flown_line: flown,
				remaining_line: remaining,
				pigeon_marker: p_marker
			});
		});

		recenter_view();
	}

	// Synchronous reactive updates on frame tick
	$effect(() => {
		const leaflet_lib = leaflet_module;
		const map = map_instance;
		// Register dependency on animation frame
		void now;
		const dynamics = flights_dynamics;

		if (!leaflet_lib || !map) return;

		dynamics.forEach((dyn, idx) => {
			const layers = flight_layers.get(idx);
			if (!layers) {
				build_all_layers(leaflet_lib, map);
				return;
			}

			layers.flown_line.setLatLngs(dyn.flown_points);
			layers.remaining_line.setLatLngs(dyn.remaining_points);
			layers.pigeon_marker.setLatLng([dyn.pigeon_coords.lat, dyn.pigeon_coords.lng]);
			const el = layers.pigeon_marker.getElement()?.querySelector('.pigeon-marker-wrapper') as HTMLElement | null;
			if (el) {
				el.style.transform = `rotate(${dyn.heading - 45}deg)`;
			}
		});
	});

	function recenter_view() {
		if (!map_instance || !leaflet_module || all_display_waypoints.length === 0) return;
		const leaflet_lib = leaflet_module;

		const waypoints_list: [number, number][] = all_display_waypoints.map((w) => [w.coords.lat, w.coords.lng]);
		flights_dynamics.forEach((d) => {
			waypoints_list.push([d.pigeon_coords.lat, d.pigeon_coords.lng]);
		});

		const bounds = leaflet_lib.latLngBounds(waypoints_list);
		map_instance.fitBounds(bounds, { padding: [55, 55], maxZoom: 16 });
	}

	function focus_flight(idx: number) {
		selected_flight_idx = idx;
		const dyn = flights_dynamics[idx];
		if (!dyn || !map_instance || !leaflet_module) return;

		const leaflet_lib = leaflet_module;
		const origin = dyn.flight.route[0]?.from;
		if (!origin) return;

		const bounds = leaflet_lib.latLngBounds([
			[origin.lat, origin.lng],
			[dyn.pigeon_coords.lat, dyn.pigeon_coords.lng]
		]);
		map_instance.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
	}

	function toggle_fullscreen() {
		is_fullscreen = !is_fullscreen;
		setTimeout(() => {
			if (map_instance) {
				map_instance.invalidateSize();
				recenter_view();
			}
		}, 180);
	}

	async function execute_recall(target_flight_id?: string) {
		const f_id = target_flight_id ?? active_selected_flight?.id;
		if (!f_id) return;

		is_recalling = true;
		recall_error = null;

		try {
			const res = await fetch(`/api/pigeon/flights/${f_id}/recall`, {
				method: 'POST'
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error || 'Failed to recall pigeon');
			}

			show_recall_confirm = false;
			if (on_recall) {
				await on_recall(f_id);
			}
		} catch (err: unknown) {
			recall_error = err instanceof Error ? err.message : 'Recall error';
		} finally {
			is_recalling = false;
		}
	}
</script>

<!-- Fullscreen Modal Container or Standard Inline Box -->
<div
	class="flight-map-container"
	class:flight-map--compact={compact && !is_fullscreen}
	class:flight-map--fullscreen={is_fullscreen}
>
	<!-- Top Bar -->
	<div class="flight-map-header">
		<div class="header-left">
			{#if all_flights.length > 1}
				<!-- Multi-pigeon flight selector tabs -->
				<div class="flights-pill-group">
					{#each flights_dynamics as dyn, idx (dyn.flight.id ?? idx)}
						<button
							type="button"
							class="flight-tab-pill"
							class:active={selected_flight_idx === idx}
							class:flight-tab-pill--recalled={dyn.is_recalled}
							onclick={() => focus_flight(idx)}
						>
							<Bird size={13} />
							<span>#{idx + 1}</span>
							<span class="tab-eta-badge">{dyn.formatted_eta}</span>
						</button>
					{/each}
				</div>
			{:else if active_dynamic}
				<div class="flight-status-pill" class:flight-status-pill--recalled={active_dynamic.is_recalled}>
					<span
						class="status-dot"
						class:status-dot--flying={!active_dynamic.is_delivered && !active_dynamic.is_recalled}
						class:status-dot--recalled={active_dynamic.is_recalled}
					></span>
					<span class="status-title">
						{active_dynamic.status_title}
					</span>
					<span class="status-badge">{active_dynamic.formatted_distance}</span>
				</div>
			{/if}
		</div>

		<div class="header-actions">
			<!-- Recall Button -->
			{#if active_dynamic && !active_dynamic.is_delivered && !active_dynamic.is_recalled && active_dynamic.flight.id}
				<button
					type="button"
					class="recall-action-btn"
					title="Recall pigeon midway back to your loft"
					onclick={() => {
						show_recall_confirm = true;
					}}
				>
					<RotateCcw size={13} />
					<span>Recall</span>
				</button>
			{/if}

			<!-- Recenter Button -->
			<button type="button" class="tool-btn" onclick={recenter_view} title="Recenter View">
				<Crosshair size={14} />
				<span class="btn-text">Recenter</span>
			</button>

			<!-- Fullscreen Toggle Button -->
			<button
				type="button"
				class="tool-btn tool-btn--primary"
				onclick={toggle_fullscreen}
				title={is_fullscreen ? 'Close Fullscreen (Esc)' : 'Expand Fullscreen'}
			>
				{#if is_fullscreen}
					<X size={16} />
				{:else}
					<Maximize2 size={14} />
				{/if}
			</button>
		</div>
	</div>

	<!-- Leaflet Map Canvas -->
	<div class="flight-map-canvas-wrap">
		<div bind:this={map_element} class="leaflet-map-element"></div>

		<!-- In-Map Multi-Pigeon Floating Badge Overlay -->
		{#if all_flights.length > 1 && !is_fullscreen}
			<div class="multi-pigeon-floating-badge">
				<Navigation size={12} />
				<span>{all_flights.length} pigeons active</span>
			</div>
		{/if}
	</div>

	<!-- Footer Status HUD -->
	{#if active_dynamic}
		<div class="flight-map-footer">
			<div class="hud-item">
				<span class="hud-label">
					{active_dynamic.is_recalled ? 'Return Progress' : 'Flight Progress'}
				</span>
				<span class="hud-value">
					{Math.round(active_dynamic.progress * 100)}% ({active_dynamic.formatted_distance})
				</span>
			</div>

			<div class="hud-progress-bar-wrap">
				<div
					class="hud-progress-bar-fill"
					class:hud-progress-bar-fill--recalled={active_dynamic.is_recalled}
					style={`width: ${Math.round(active_dynamic.progress * 100)}%`}
				></div>
			</div>

			<div class="hud-item hud-item--right">
				<span class="hud-label">
					{active_dynamic.is_recalled ? 'Expected Return' : 'Estimated Delivery'}
				</span>
				<span
					class="hud-value hud-value--eta"
					class:hud-value--recalled={active_dynamic.is_recalled}
				>
					{active_dynamic.formatted_eta}
				</span>
			</div>
		</div>
	{/if}

	<!-- Recall Confirmation Modal -->
	{#if show_recall_confirm}
		<div
			class="recall-modal-backdrop"
			role="button"
			tabindex="0"
			onclick={() => (show_recall_confirm = false)}
			onkeydown={(e) => e.key === 'Escape' && (show_recall_confirm = false)}
		>
			<div
				class="recall-modal-card"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="recall-modal-icon">
					<AlertTriangle size={24} color="#ea580c" />
				</div>
				<h3>Recall Pigeon?</h3>
				<p>
					The bird will turn around immediately and fly straight back to your loft. Any undelivered
					recipients will not receive this message.
				</p>

				{#if recall_error}
					<div class="recall-modal-error">{recall_error}</div>
				{/if}

				<div class="recall-modal-actions">
					<button
						type="button"
						class="btn-cancel"
						onclick={() => (show_recall_confirm = false)}
						disabled={is_recalling}
					>
						Cancel
					</button>
					<button
						type="button"
						class="btn-confirm-recall"
						onclick={() => execute_recall()}
						disabled={is_recalling}
					>
						{is_recalling ? 'Recalling...' : 'Yes, Recall Pigeon'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.flight-map-container {
		position: relative;
		border: 1px solid #cbd5e1;
		border-radius: 16px;
		overflow: hidden;
		background: #ffffff;
		box-shadow: 0 4px 16px -2px rgba(15, 23, 42, 0.08);
		transition: all 0.25s ease;
	}

	/* Fullscreen Pop-up overlay styles */
	.flight-map--fullscreen {
		position: fixed !important;
		inset: 0 !important;
		width: 100vw !important;
		height: 100vh !important;
		z-index: 99999 !important;
		border-radius: 0 !important;
		border: none !important;
		display: flex !important;
		flex-direction: column !important;
		box-shadow: none !important;
	}

	.flight-map-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.95rem;
		background: #ffffff;
		border-bottom: 1px solid #e2e8f0;
		gap: 0.5rem;
		z-index: 2;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
		overflow-x: auto;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	/* Tab pills for multi-pigeon selector */
	.flights-pill-group {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: #f1f5f9;
		padding: 3px;
		border-radius: 9999px;
	}

	.flight-tab-pill {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		font-size: 0.76rem;
		font-weight: 600;
		color: #475569;
		background: transparent;
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.flight-tab-pill.active {
		background: #ffffff;
		color: #0284c7;
		box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
	}

	.flight-tab-pill--recalled.active {
		color: #ea580c;
	}

	.tab-eta-badge {
		font-size: 0.7rem;
		font-weight: 700;
		background: rgba(2, 132, 199, 0.12);
		padding: 1px 6px;
		border-radius: 9999px;
	}

	.flight-status-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #10b981;
	}

	.status-dot--flying {
		background: #0284c7;
		box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.25);
		animation: pulse-dot 2s infinite;
	}

	.status-dot--recalled {
		background: #ea580c;
		box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.25);
		animation: pulse-dot 1.4s infinite;
	}

	@keyframes pulse-dot {
		0%,
		100% {
			transform: scale(1);
			opacity: 1;
		}
		50% {
			transform: scale(1.25);
			opacity: 0.75;
		}
	}

	.status-title {
		font-size: 0.82rem;
		font-weight: 700;
		color: #0f172a;
	}

	.status-badge {
		font-size: 0.72rem;
		font-weight: 700;
		color: #0369a1;
		background: #e0f2fe;
		padding: 0.18rem 0.5rem;
		border-radius: 9999px;
	}

	.flight-status-pill--recalled .status-badge {
		color: #c2410c;
		background: #ffedd5;
	}

	.tool-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.75rem;
		font-weight: 600;
		color: #475569;
		background: #f8fafc;
		padding: 5px 9px;
		border-radius: 7px;
		border: 1px solid #e2e8f0;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tool-btn:hover {
		background: #e2e8f0;
		color: #0f172a;
	}

	.tool-btn--primary {
		color: #0284c7;
		background: #e0f2fe;
		border-color: #bae6fd;
	}

	.tool-btn--primary:hover {
		background: #0284c7;
		color: #ffffff;
		border-color: #0284c7;
	}

	.recall-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.74rem;
		font-weight: 700;
		color: #c2410c;
		background: #fff7ed;
		padding: 5px 9px;
		border-radius: 7px;
		border: 1px solid #fed7aa;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.recall-action-btn:hover {
		background: #ea580c;
		color: #ffffff;
		border-color: #ea580c;
	}

	.flight-map-canvas-wrap {
		position: relative;
		width: 100%;
		height: 300px;
		background: #f8fafc;
		flex: 1;
	}

	.flight-map--compact .flight-map-canvas-wrap {
		height: 220px;
	}

	.flight-map--fullscreen .flight-map-canvas-wrap {
		height: auto;
		flex: 1;
	}

	.leaflet-map-element {
		width: 100%;
		height: 100%;
		z-index: 1;
	}

	.multi-pigeon-floating-badge {
		position: absolute;
		bottom: 12px;
		left: 12px;
		z-index: 1000;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		background: rgba(15, 23, 42, 0.85);
		color: #f8fafc;
		font-size: 11px;
		font-weight: 600;
		border-radius: 9999px;
		backdrop-filter: blur(4px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	/* -------------------------------------------------------------
	   LEAFLET ZERO-OFFSET ICONS (Pixel-perfect coordinate mapping)
	------------------------------------------------------------- */
	:global(.leaflet-zero-icon) {
		background: transparent !important;
		border: none !important;
		overflow: visible !important;
	}

	/* Loft Markers: Center of the bottom dot sits exactly on the coordinate (0, 0) */
	:global(.loft-marker-wrapper) {
		position: absolute;
		left: 0;
		top: 0;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		pointer-events: auto;
		filter: drop-shadow(0 3px 6px rgba(15, 23, 42, 0.22));
		z-index: 50;
	}

	:global(.loft-marker-badge) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		background: #ffffff;
		border-radius: 9999px;
		font-size: 12px;
		font-weight: 700;
		color: #0f172a;
		border: 1.5px solid #cbd5e1;
		white-space: nowrap;
	}

	:global(.loft-marker--dest .loft-marker-badge) {
		border-color: #86efac;
		color: #15803d;
	}

	:global(.loft-marker-dot) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #0284c7;
		border: 2.5px solid #ffffff;
		box-shadow: 0 2px 5px rgba(2, 132, 199, 0.4);
		margin-top: 3px;
		margin-bottom: -6px; /* Dot center aligns with Leaflet LatLng anchor (0, 0) */
	}

	:global(.loft-marker--dest .loft-marker-dot) {
		background: #16a34a;
		box-shadow: 0 2px 5px rgba(22, 163, 74, 0.4);
	}

	/* Pigeon Marker: Center of bird sits exactly on (0, 0) */
	:global(.pigeon-marker-wrapper) {
		position: absolute;
		left: 0;
		top: 0;
		width: 0;
		height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.1s linear;
	}

	:global(.pigeon-radar-glow) {
		position: absolute;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		animation: pulse-ring 2s infinite ease-out;
		pointer-events: none;
	}

	@keyframes pulse-ring {
		0% {
			transform: scale(0.5);
			opacity: 0.9;
		}
		100% {
			transform: scale(1.6);
			opacity: 0;
		}
	}

	:global(.pigeon-bird-icon) {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		filter: drop-shadow(0 3px 6px rgba(2, 132, 199, 0.45));
		cursor: pointer;
	}

	:global(.pigeon-bird-icon--recalled) {
		filter: drop-shadow(0 3px 6px rgba(234, 88, 12, 0.45));
	}

	/* -------------------------------------------------------------
	   FOOTER HUD
	------------------------------------------------------------- */
	.flight-map-footer {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.95rem;
		padding: 0.6rem 0.95rem;
		background: #ffffff;
		border-top: 1px solid #e2e8f0;
		font-size: 0.78rem;
		z-index: 2;
	}

	.hud-item {
		display: flex;
		flex-direction: column;
	}

	.hud-item--right {
		text-align: right;
		align-items: flex-end;
	}

	.hud-label {
		font-size: 0.66rem;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-weight: 600;
	}

	.hud-value {
		font-weight: 700;
		color: #0f172a;
	}

	.hud-value--eta {
		color: #0284c7;
	}

	.hud-value--recalled {
		color: #ea580c;
	}

	.hud-progress-bar-wrap {
		height: 7px;
		background: #e2e8f0;
		border-radius: 9999px;
		overflow: hidden;
		position: relative;
	}

	.hud-progress-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #38bdf8, #0284c7);
		border-radius: 9999px;
		transition: width 0.3s ease;
	}

	.hud-progress-bar-fill--recalled {
		background: linear-gradient(90deg, #fb923c, #ea580c);
	}

	/* -------------------------------------------------------------
	   RECALL MODAL
	------------------------------------------------------------- */
	.recall-modal-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(15, 23, 42, 0.45);
		backdrop-filter: blur(4px);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.recall-modal-card {
		background: #ffffff;
		border-radius: 16px;
		padding: 1.3rem;
		max-width: 380px;
		width: 100%;
		box-shadow: 0 20px 30px -10px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.6rem;
		animation: pop-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes pop-in {
		0% {
			transform: scale(0.92);
			opacity: 0;
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.recall-modal-icon {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: #ffedd5;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.recall-modal-card h3 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		color: #0f172a;
	}

	.recall-modal-card p {
		margin: 0;
		font-size: 0.83rem;
		line-height: 1.45;
		color: #475569;
	}

	.recall-modal-error {
		font-size: 0.78rem;
		color: #dc2626;
		background: #fef2f2;
		padding: 0.4rem 0.8rem;
		border-radius: 8px;
		width: 100%;
	}

	.recall-modal-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		width: 100%;
		margin-top: 0.5rem;
	}

	.btn-cancel {
		padding: 0.55rem;
		font-size: 0.82rem;
		font-weight: 600;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: #f8fafc;
		color: #475569;
		cursor: pointer;
	}

	.btn-confirm-recall {
		padding: 0.55rem;
		font-size: 0.82rem;
		font-weight: 700;
		border: 1px solid #ea580c;
		border-radius: 8px;
		background: #ea580c;
		color: #ffffff;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3);
	}

	.btn-confirm-recall:hover {
		background: #c2410c;
	}

	.btn-cancel:hover {
		background: #e2e8f0;
	}

	@media (max-width: 640px) {
		.btn-text {
			display: none;
		}
	}
</style>
