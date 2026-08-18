<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
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
	import {
		epoch_from_sql,
		format_duration,
		format_distance
	} from '$lib/pigeon/clock';
	import HomeLocationGate from '$lib/components/pigeon/HomeLocationGate.svelte';
	import {
		Bird,
		Compass,
		Crosshair,
		RotateCcw,
		Send,
		MessageSquare,
		ExternalLink,
		Navigation,
		AlertTriangle,
		Clock,
		Maximize2,
		X
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import 'leaflet/dist/leaflet.css';

	const { data }: { data: PageData } = $props();

	let map_element: HTMLDivElement | null = $state(null);
	let now = $state(Date.now());
	const clock_offset = $derived(data.server_now - Date.now());
	const server_now = $derived(now + clock_offset);

	let leaflet_module = $state<typeof import('leaflet') | null>(null);
	let map_instance = $state<import('leaflet').Map | null>(null);

	let selected_flight_id = $state<string | null>(null);
	let is_fullscreen = $state(false);

	// Recall modal state
	let recalling_flight_id = $state<string | null>(null);
	let is_recalling = $state(false);
	let recall_error = $state<string | null>(null);

	// Color palette for multiple pigeons
	const flight_colors = [
		{ stroke: '#0284c7', glow: 'rgba(2, 132, 199, 0.3)', dot: '#0284c7', fill: '#38bdf8' },
		{ stroke: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.3)', dot: '#8b5cf6', fill: '#a78bfa' },
		{ stroke: '#059669', glow: 'rgba(5, 150, 105, 0.3)', dot: '#059669', fill: '#34d399' },
		{ stroke: '#d97706', glow: 'rgba(217, 119, 6, 0.3)', dot: '#d97706', fill: '#fbbf24' },
		{ stroke: '#ec4899', glow: 'rgba(236, 72, 153, 0.3)', dot: '#ec4899', fill: '#f472b6' }
	];

	// Leaflet map layers per flight
	type MapFlightLayers = {
		flown_line: import('leaflet').Polyline;
		remaining_line: import('leaflet').Polyline;
		pigeon_marker: import('leaflet').Marker;
	};

	const flight_layers = new SvelteMap<string, MapFlightLayers>();
	let loft_markers: import('leaflet').Marker[] = [];

	// Derived list of flight items with live calculated flight dynamics
	type FlightDisplay = PageData['flights'][number] & {
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
		color: (typeof flight_colors)[0];
	};

	function compute_recalled_map_flight(
		item: PageData['flights'][number],
		origin: Coords,
		server_time: number,
		color: (typeof flight_colors)[0]
	): FlightDisplay {
		const departed_at_ms = epoch_from_sql(item.flight.departed_at) ?? server_time;
		const recalled_at_ms = item.flight.recalled_at ? (epoch_from_sql(item.flight.recalled_at) ?? 0) : 0;

		const recall_snapshot = position_at(item.flight.route, departed_at_ms, recalled_at_ms);
		const recall_origin = recall_snapshot.coords;
		const return_km = haversine_km(recall_origin, origin);
		const return_total_ms = flight_ms_for_km(return_km);
		const elapsed_return_ms = Math.max(0, server_time - recalled_at_ms);

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
			...item,
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
			],
			color
		};
	}

	function build_route_points(
		route: RouteLeg[],
		current_pos: { leg_index: number },
		pigeon_coords: Coords
	): { passed: [number, number][]; future: [number, number][] } {
		const passed: [number, number][] = [];
		for (let i = 0; i <= current_pos.leg_index && i < route.length; i++) {
			passed.push([route[i].from.lat, route[i].from.lng]);
		}
		passed.push([pigeon_coords.lat, pigeon_coords.lng]);

		const future: [number, number][] = [[pigeon_coords.lat, pigeon_coords.lng]];
		const leg = route[current_pos.leg_index] ?? route[0];
		if (leg) future.push([leg.to.lat, leg.to.lng]);
		for (let i = current_pos.leg_index + 1; i < route.length; i++) {
			future.push([route[i].to.lat, route[i].to.lng]);
		}

		return { passed, future };
	}

	function compute_outbound_map_flight(
		item: PageData['flights'][number],
		origin: Coords,
		server_time: number,
		color: (typeof flight_colors)[0]
	): FlightDisplay {
		const route = item.flight.route;
		const total_km = item.flight.total_distance_km || route_total_km(route);
		const departed_at_ms = epoch_from_sql(item.flight.departed_at) ?? server_time;

		const schedule = delivery_schedule(route, departed_at_ms);
		const next_pending_stop = schedule.find((s) => s.deliver_at > server_time);
		const total_round_trip_ms = flight_ms_for_km(total_km);
		const available_at_ms = departed_at_ms + total_round_trip_ms;

		const is_delivered = !next_pending_stop;
		const is_returned_home = server_time >= available_at_ms;
		const current_pos = position_at(route, departed_at_ms, server_time);
		const pigeon_coords = current_pos.coords;

		const leg = route[current_pos.leg_index] ?? route[0];
		const heading = leg
			? (Math.atan2(leg.to.lng - leg.from.lng, leg.to.lat - leg.from.lat) * 180) / Math.PI
			: 0;

		let progress = 0;
		let formatted_eta = '';
		let status_title = '';
		let formatted_distance = '';

		if (!is_delivered && next_pending_stop) {
			const remaining_ms = Math.max(0, next_pending_stop.deliver_at - server_time);
			const total_leg_ms = flight_ms_for_km(next_pending_stop.distance_km);
			const elapsed_ms = Math.max(0, server_time - departed_at_ms);
			progress = total_leg_ms <= 0 ? 1 : Math.min(1, elapsed_ms / total_leg_ms);

			const target_recipient = item.recipients.find((r) => r.id === next_pending_stop.recipient_id);
			const recipient_label = target_recipient?.name ?? 'recipient';
			const duration_str = format_duration(remaining_ms);
			formatted_eta = duration_str === 'now' ? 'Landing now' : `reaches ${recipient_label} in ${duration_str}`;
			status_title = `In Flight (${Math.round(progress * 100)}%)`;
			formatted_distance = format_distance(next_pending_stop.distance_km);
		} else if (!is_returned_home) {
			const remaining_return_ms = Math.max(0, available_at_ms - server_time);
			progress = progress_at(route, departed_at_ms, server_time);
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

		const { passed, future } = build_route_points(route, current_pos, pigeon_coords);

		return {
			...item,
			pigeon_coords,
			heading,
			progress,
			is_recalled: false,
			is_delivered,
			is_returned_home,
			status_title,
			formatted_distance,
			formatted_eta,
			flown_points: passed,
			remaining_points: future,
			color
		};
	}

	const processed_flights = $derived.by<FlightDisplay[]>(() => {
		return data.flights.map((item, idx) => {
			const route = item.flight.route;
			const origin = route[0]?.from ?? data.user_loft ?? { lat: 0, lng: 0 };
			const is_recalled = item.flight.status === 'recalled' && !!item.flight.recalled_at;
			const color = is_recalled
				? { stroke: '#ea580c', glow: 'rgba(234, 88, 12, 0.35)', dot: '#ea580c', fill: '#f97316' }
				: flight_colors[idx % flight_colors.length];

			if (is_recalled && item.flight.recalled_at) {
				return compute_recalled_map_flight(item, origin, server_now, color);
			}

			return compute_outbound_map_flight(item, origin, server_now, color);
		});
	});

	const selected_flight = $derived(
		processed_flights.find((f) => f.flight.id === selected_flight_id) ??
			processed_flights[0] ??
			null
	);

	// Waypoints to display
	const waypoints = $derived.by(() => {
		const list: Array<{ coords: Coords; label: string; is_origin: boolean }> = [];
		if (data.user_loft) {
			list.push({ coords: data.user_loft, label: 'Your Loft', is_origin: true });
		}

		const seen = new SvelteSet<string>();
		for (const fl of data.flights) {
			for (const rec of fl.recipients) {
				if (seen.has(rec.id)) continue;
				seen.add(rec.id);

				const dest_leg = fl.flight.route.find((l) => l.recipient_id === rec.id);
				if (dest_leg) {
					list.push({ coords: dest_leg.to, label: rec.name, is_origin: false });
				}
			}
		}
		return list;
	});

	// Frame animation loop
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

		const on_key = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && is_fullscreen) toggle_fullscreen();
		};
		window.addEventListener('keydown', on_key);

		return () => {
			if (frame) cancelAnimationFrame(frame);
			window.removeEventListener('keydown', on_key);
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

		leaflet_lib.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
			maxZoom: 19,
			subdomains: 'abcd'
		}).addTo(map);

		leaflet_lib.control.zoom({ position: 'topright' }).addTo(map);
		map_instance = map;

		build_layers(leaflet_lib, map);

		return () => {
			if (map_instance) {
				map_instance.remove();
				map_instance = null;
			}
			flight_layers.clear();
			loft_markers = [];
		};
	});

	function build_layers(leaflet_lib: typeof import('leaflet'), map: import('leaflet').Map) {
		loft_markers.forEach((m) => m.remove());
		loft_markers = [];

		waypoints.forEach((wp) => {
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

		flight_layers.forEach((layers) => {
			layers.flown_line.remove();
			layers.remaining_line.remove();
			layers.pigeon_marker.remove();
		});
		flight_layers.clear();

		processed_flights.forEach((fl, idx) => {
			const flown = leaflet_lib.polyline(fl.flown_points, {
				color: fl.color.stroke,
				weight: 4.5,
				opacity: 0.95,
				lineCap: 'round',
				lineJoin: 'round'
			}).addTo(map);

			const remaining = leaflet_lib.polyline(fl.remaining_points, {
				color: fl.is_recalled ? '#fdba74' : '#94a3b8',
				weight: 3,
				opacity: 0.8,
				dashArray: '6, 8',
				lineCap: 'round',
				lineJoin: 'round'
			}).addTo(map);

			const pigeon_html = `
				<div class="pigeon-marker-wrapper" style="transform: rotate(${fl.heading - 45}deg);">
					<div class="pigeon-radar-glow" style="background: ${fl.color.glow};"></div>
					<div class="pigeon-bird-icon ${fl.is_recalled ? 'pigeon-bird-icon--recalled' : ''}">
						<svg viewBox="0 0 15 15" width="34" height="34" style="overflow: visible;">
							<path d="M0 0h15v15H0z" fill="none" />
							<path fill="${fl.color.stroke}" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round" d="m1.63 11.24l4.26-3.2q-.93-.39-1.2-.66c-.27-.27-.35-2.13-.53-3.2l-.11-.07C3.16 3.46-.35.43.03.05c.4-.4 5.59 1.6 6.26 2.27c.44.44.84 1.28 1.2 2.53c.91-.25 1.51-.5 1.8-.74l.06-.06c.27-.27.8-.45 1.6-.53l1.33-.8l-.8 1.33c-.08.73-.23 1.24-.46 1.52l-.07.08c-.26.26-.53.88-.8 1.86c1.25.36 2.09.76 2.53 1.2c.67.67 2.67 5.86 2.27 6.26s-3.71-3.48-4.13-4.13c-1.07-.18-2.93-.26-3.2-.53q-.27-.27-.66-1.2l-3.2 4.26c-.71 0-1.24-.17-1.6-.53s-.53-.89-.53-1.6" />
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

			const p_marker = leaflet_lib.marker([fl.pigeon_coords.lat, fl.pigeon_coords.lng], {
				icon: p_icon,
				zIndexOffset: 200 + idx
			}).addTo(map);

			p_marker.on('click', () => {
				selected_flight_id = fl.flight.id;
			});

			flight_layers.set(fl.flight.id, {
				flown_line: flown,
				remaining_line: remaining,
				pigeon_marker: p_marker
			});
		});

		recenter_view();
	}

	// Update positions every frame
	$effect(() => {
		const leaflet_lib = leaflet_module;
		const map = map_instance;
		void now;
		const flights = processed_flights;

		if (!leaflet_lib || !map) return;

		flights.forEach((fl) => {
			const layers = flight_layers.get(fl.flight.id);
			if (!layers) {
				build_layers(leaflet_lib, map);
				return;
			}

			layers.flown_line.setLatLngs(fl.flown_points);
			layers.remaining_line.setLatLngs(fl.remaining_points);
			layers.pigeon_marker.setLatLng([fl.pigeon_coords.lat, fl.pigeon_coords.lng]);

			const el = layers.pigeon_marker
				.getElement()
				?.querySelector('.pigeon-marker-wrapper') as HTMLElement | null;
			if (el) {
				el.style.transform = `rotate(${fl.heading - 45}deg)`;
			}
		});
	});

	function recenter_view() {
		if (!map_instance || !leaflet_module) return;
		const leaflet_lib = leaflet_module;

		const pts: [number, number][] = waypoints.map((w) => [w.coords.lat, w.coords.lng]);
		processed_flights.forEach((f) => {
			pts.push([f.pigeon_coords.lat, f.pigeon_coords.lng]);
		});

		if (pts.length === 0 && data.user_loft) {
			pts.push([data.user_loft.lat, data.user_loft.lng]);
		}

		if (pts.length > 0) {
			const bounds = leaflet_lib.latLngBounds(pts);
			map_instance.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
		}
	}

	function focus_pigeon(flight_id: string) {
		selected_flight_id = flight_id;
		const fl = processed_flights.find((f) => f.flight.id === flight_id);
		if (!fl || !map_instance || !leaflet_module) return;

		const leaflet_lib = leaflet_module;
		const origin = fl.flight.route[0]?.from ?? data.user_loft;
		if (!origin) return;

		const bounds = leaflet_lib.latLngBounds([
			[origin.lat, origin.lng],
			[fl.pigeon_coords.lat, fl.pigeon_coords.lng]
		]);
		map_instance.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
	}

	function toggle_fullscreen() {
		is_fullscreen = !is_fullscreen;
		setTimeout(() => {
			if (map_instance) {
				map_instance.invalidateSize();
				recenter_view();
			}
		}, 200);
	}

	async function execute_recall(f_id: string) {
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

			recalling_flight_id = null;
			await invalidateAll();
		} catch (err: unknown) {
			recall_error = err instanceof Error ? err.message : 'Recall failed';
		} finally {
			is_recalling = false;
		}
	}
</script>

<svelte:head>
	<title>My Pigeon Map · Pigeon</title>
</svelte:head>

{#if data.home_required}
	<HomeLocationGate
		dismissible={false}
		reason="Pigeon post needs your loft location to show your flight routes on the map."
		on_saved={async () => {
			await invalidateAll();
		}}
	/>
{:else}
	<div class="my-map-page" class:my-map-page--fullscreen={is_fullscreen}>
		<!-- Page Header -->
		<header class="map-page-header">
			<div class="header-main">
				<div class="header-icon-badge">
					<Compass size={22} color="#0284c7" />
				</div>
				<div>
					<h1>My Pigeon Map</h1>
					<p class="subtitle">Live aerial tracking of all your carrier pigeons</p>
				</div>
			</div>

			<div class="header-actions">
				<div class="active-count-badge">
					<Bird size={15} />
					<span>{processed_flights.length} in flight</span>
				</div>

				<button type="button" class="ctrl-btn" onclick={recenter_view} title="Fit all on map">
					<Crosshair size={15} />
					<span>Recenter</span>
				</button>

				<button
					type="button"
					class="ctrl-btn ctrl-btn--primary"
					onclick={toggle_fullscreen}
					title={is_fullscreen ? 'Close Fullscreen' : 'Fullscreen'}
				>
					{#if is_fullscreen}
						<X size={17} />
					{:else}
						<Maximize2 size={15} />
					{/if}
				</button>
			</div>
		</header>

		<!-- Main Layout Grid -->
		<div class="map-layout-grid">
			<!-- Left/Top: Map View Canvas -->
			<div class="map-canvas-container">
				<div bind:this={map_element} class="leaflet-full-canvas"></div>

				<!-- Floating Pigeon Focus HUD Overlay -->
				{#if selected_flight}
					<div class="floating-flight-hud">
						<div class="hud-top">
							<div class="hud-bird-pill" style={`border-color: ${selected_flight.color.stroke};`}>
								<Bird size={14} color={selected_flight.color.stroke} />
								<span class="hud-bird-name">{selected_flight.conversation_title}</span>
							</div>

							<button
								type="button"
								class="hud-close-btn"
								onclick={() => (selected_flight_id = null)}
								aria-label="Deselect"
							>
								<X size={14} />
							</button>
						</div>

						<div class="hud-stats">
							<div class="hud-stat-col">
								<span class="stat-lbl">Status</span>
								<span
									class="stat-val"
									class:stat-val--recalled={selected_flight.is_recalled}
									class:stat-val--delivered={selected_flight.is_delivered}
								>
									{selected_flight.status_title}
								</span>
							</div>

							<div class="hud-stat-col">
								<span class="stat-lbl">ETA</span>
								<span class="stat-val stat-val--eta">{selected_flight.formatted_eta}</span>
							</div>

							<div class="hud-stat-col">
								<span class="stat-lbl">Distance</span>
								<span class="stat-val">{selected_flight.formatted_distance}</span>
							</div>
						</div>

						<div class="hud-progress-line">
							<div
								class="hud-progress-fill"
								class:hud-progress-fill--recalled={selected_flight.is_recalled}
								style={`width: ${Math.round(selected_flight.progress * 100)}%; background: ${selected_flight.color.stroke};`}
							></div>
						</div>

						<div class="hud-bottom-actions">
							{#if !selected_flight.is_delivered && !selected_flight.is_recalled}
								<button
									type="button"
									class="hud-recall-btn"
									onclick={() => (recalling_flight_id = selected_flight.flight.id)}
								>
									<RotateCcw size={13} />
									<span>Recall Pigeon</span>
								</button>
							{/if}

							<a
								class="hud-conv-link"
								href={resolve(`/messages/${selected_flight.flight.conversation_id}`)}
							>
								<MessageSquare size={13} />
								<span>Open Conversation</span>
								<ExternalLink size={11} />
							</a>
						</div>
					</div>
				{/if}
			</div>

			<!-- Right: Active Flights Sidebar / Cards -->
			<aside class="flights-sidebar">
				<div class="flights-sidebar-head">
					<h2>Active Flock ({processed_flights.length})</h2>
					<a class="new-pigeon-link" href={resolve('/compose')}>
						<Send size={13} />
						<span>Send Pigeon</span>
					</a>
				</div>

				<div class="flights-list-scroll">
					{#if processed_flights.length === 0}
						<div class="empty-flock-box">
							<div class="empty-flock-icon">
								<Bird size={36} color="#94a3b8" />
							</div>
							<h3>All pigeons in the loft</h3>
							<p>
								You have no pigeons currently flying. Send a message to mutuals to see your birds
								travel across the map in real-time!
							</p>
							<a class="empty-send-btn" href={resolve('/messages')}>
								<Send size={15} />
								<span>Send a Message</span>
							</a>
						</div>
					{:else}
						{#each processed_flights as item (item.flight.id)}
							<div
								class="flight-item-card"
								class:flight-item-card--selected={selected_flight_id === item.flight.id}
								class:flight-item-card--recalled={item.is_recalled}
								onclick={() => focus_pigeon(item.flight.id)}
								role="button"
								tabindex="0"
								onkeydown={(e) => e.key === 'Enter' && focus_pigeon(item.flight.id)}
							>
								<!-- Top Row -->
								<div class="flight-card-header">
									<div class="recipient-info">
										<div class="card-bird-dot" style={`background: ${item.color.stroke};`}></div>
										<span class="recipient-name">{item.conversation_title}</span>
									</div>

									<span
										class="card-status-pill"
										class:card-status-pill--recalled={item.is_recalled}
										class:card-status-pill--delivered={item.is_delivered}
									>
										{#if item.is_recalled}
											{item.is_returned_home ? 'Returned' : 'Recalled'}
										{:else if item.is_delivered}
											{item.is_returned_home ? 'Delivered' : 'Delivered'}
										{:else}
											{Math.round(item.progress * 100)}%
										{/if}
									</span>
								</div>

								<!-- Message Snippet -->
								{#if item.message_body}
									<p class="card-message-snippet">"{item.message_body}"</p>
								{/if}

								<!-- Progress Bar -->
								<div class="card-progress-bar">
									<div
										class="card-progress-fill"
										class:card-progress-fill--recalled={item.is_recalled}
										style={`width: ${Math.round(item.progress * 100)}%; background: ${item.color.stroke};`}
									></div>
								</div>

								<!-- Stats & ETA -->
								<div class="card-footer-stats">
									<div class="card-eta-col">
										<Clock size={12} />
										<span class="card-eta-val">{item.formatted_eta}</span>
									</div>
									<span class="card-dist-val">{item.formatted_distance}</span>
								</div>

								<!-- Action Buttons -->
								<div
									class="card-actions-bar"
									role="toolbar"
									tabindex="-1"
									onclick={(e) => e.stopPropagation()}
									onkeydown={(e) => e.stopPropagation()}
								>
									<button
										type="button"
										class="card-btn-focus"
										onclick={() => focus_pigeon(item.flight.id)}
									>
										<Navigation size={12} />
										<span>Track</span>
									</button>

									{#if !item.is_delivered && !item.is_recalled}
										<button
											type="button"
											class="card-btn-recall"
											onclick={() => (recalling_flight_id = item.flight.id)}
										>
											<RotateCcw size={12} />
											<span>Recall</span>
										</button>
									{/if}

									<a
										class="card-btn-conv"
										href={resolve(`/messages/${item.flight.conversation_id}`)}
										title="Open conversation"
									>
										<MessageSquare size={13} />
									</a>
								</div>
							</div>
						{/each}
					{/if}
				</div>
			</aside>
		</div>

		<!-- Recall Confirmation Modal -->
		{#if recalling_flight_id}
			<div
				class="modal-backdrop"
				role="button"
				tabindex="0"
				onclick={() => (recalling_flight_id = null)}
				onkeydown={(e) => e.key === 'Escape' && (recalling_flight_id = null)}
			>
				<div
					class="modal-card"
					role="dialog"
					aria-modal="true"
					tabindex="-1"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => e.stopPropagation()}
				>
					<div class="modal-alert-icon">
						<AlertTriangle size={26} color="#ea580c" />
					</div>
					<h3>Recall this pigeon?</h3>
					<p>
						The pigeon will turn around and immediately fly back to your loft. Any undelivered
						recipients will not receive this message.
					</p>

					{#if recall_error}
						<div class="modal-error-box">{recall_error}</div>
					{/if}

					<div class="modal-actions">
						<button
							type="button"
							class="btn-cancel"
							onclick={() => (recalling_flight_id = null)}
							disabled={is_recalling}
						>
							Cancel
						</button>
						<button
							type="button"
							class="btn-recall-confirm"
							onclick={() => recalling_flight_id && execute_recall(recalling_flight_id)}
							disabled={is_recalling}
						>
							{is_recalling ? 'Recalling...' : 'Turn Bird Around'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.my-map-page {
		display: flex;
		flex-direction: column;
		height: calc(100vh - var(--navbar-height, 0px));
		background: #f8fafc;
		overflow: hidden;
	}

	.my-map-page--fullscreen {
		position: fixed;
		inset: 0;
		z-index: 99999;
		height: 100vh;
		background: #ffffff;
	}

	/* Top Header */
	.map-page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.85rem 1.4rem;
		background: #ffffff;
		border-bottom: 1px solid #e2e8f0;
		box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
		z-index: 10;
		gap: 1rem;
	}

	.header-main {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}

	.header-icon-badge {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: #e0f2fe;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.map-page-header h1 {
		margin: 0;
		font-size: 1.2rem;
		font-weight: 700;
		color: #0f172a;
		line-height: 1.2;
	}

	.subtitle {
		margin: 0;
		font-size: 0.78rem;
		color: #64748b;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.active-count-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0.4rem 0.8rem;
		background: #e0f2fe;
		color: #0284c7;
		font-size: 0.8rem;
		font-weight: 700;
		border-radius: 9999px;
		border: 1px solid #bae6fd;
	}

	.ctrl-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0.42rem 0.85rem;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		font-size: 0.8rem;
		font-weight: 600;
		color: #334155;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.ctrl-btn:hover {
		background: #f1f5f9;
		border-color: #94a3b8;
		color: #0f172a;
	}

	.ctrl-btn--primary {
		color: #0284c7;
		background: #f0f9ff;
		border-color: #bae6fd;
	}

	.ctrl-btn--primary:hover {
		background: #0284c7;
		color: #ffffff;
		border-color: #0284c7;
	}

	/* Main Layout */
	.map-layout-grid {
		display: grid;
		grid-template-columns: 1fr 360px;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.map-canvas-container {
		position: relative;
		width: 100%;
		height: 100%;
		background: #f1f5f9;
	}

	.leaflet-full-canvas {
		width: 100%;
		height: 100%;
		z-index: 1;
	}

	/* Floating Flight HUD Overlay */
	.floating-flight-hud {
		position: absolute;
		top: 16px;
		left: 16px;
		z-index: 1000;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(10px);
		border: 1px solid #cbd5e1;
		border-radius: 16px;
		padding: 1rem 1.1rem;
		width: 320px;
		box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
		animation: slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	@keyframes slide-in {
		0% {
			transform: translateY(-8px);
			opacity: 0;
		}
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.hud-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.hud-bird-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 9px;
		background: #ffffff;
		border: 1.5px solid #0284c7;
		border-radius: 9999px;
		font-size: 0.8rem;
		font-weight: 700;
		color: #0f172a;
	}

	.hud-close-btn {
		border: none;
		background: transparent;
		color: #94a3b8;
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
	}

	.hud-close-btn:hover {
		background: #f1f5f9;
		color: #0f172a;
	}

	.hud-stats {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
		padding: 0.4rem 0;
	}

	.hud-stat-col {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-lbl {
		font-size: 0.65rem;
		font-weight: 600;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.stat-val {
		font-size: 0.82rem;
		font-weight: 700;
		color: #0f172a;
	}

	.stat-val--eta {
		color: #0284c7;
	}

	.stat-val--recalled {
		color: #ea580c;
	}

	.stat-val--delivered {
		color: #16a34a;
	}

	.hud-progress-line {
		height: 6px;
		background: #e2e8f0;
		border-radius: 9999px;
		overflow: hidden;
	}

	.hud-progress-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.3s ease;
	}

	.hud-bottom-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		margin-top: 0.3rem;
	}

	.hud-recall-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 9px;
		background: #fff7ed;
		color: #c2410c;
		border: 1px solid #fed7aa;
		border-radius: 7px;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}

	.hud-recall-btn:hover {
		background: #ea580c;
		color: #ffffff;
	}

	.hud-conv-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 9px;
		background: #f8fafc;
		color: #475569;
		border: 1px solid #e2e8f0;
		border-radius: 7px;
		font-size: 0.75rem;
		font-weight: 600;
		text-decoration: none;
	}

	.hud-conv-link:hover {
		background: #e0f2fe;
		color: #0284c7;
		border-color: #bae6fd;
	}

	/* Right: Flights Sidebar */
	.flights-sidebar {
		background: #ffffff;
		border-left: 1px solid #e2e8f0;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.flights-sidebar-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.1rem;
		border-bottom: 1px solid #e2e8f0;
	}

	.flights-sidebar-head h2 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: #0f172a;
	}

	.new-pigeon-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 9px;
		background: #0284c7;
		color: #ffffff;
		font-size: 0.74rem;
		font-weight: 700;
		border-radius: 9999px;
		text-decoration: none;
		transition: background 0.15s ease;
	}

	.new-pigeon-link:hover {
		background: #0369a1;
	}

	.flights-list-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	/* Flight Item Card */
	.flight-item-card {
		background: #ffffff;
		border: 1.5px solid #e2e8f0;
		border-radius: 12px;
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		cursor: pointer;
		transition: all 0.18s ease;
		box-shadow: 0 2px 5px rgba(15, 23, 42, 0.04);
	}

	.flight-item-card:hover {
		border-color: #93c5fd;
		background: #f8fbff;
		box-shadow: 0 4px 12px rgba(2, 132, 199, 0.08);
	}

	.flight-item-card--selected {
		border-color: #0284c7;
		background: #f0f9ff;
		box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
	}

	.flight-item-card--recalled {
		border-color: #fed7aa;
		background: #fffdfa;
	}

	.flight-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.recipient-info {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}

	.card-bird-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.recipient-name {
		font-size: 0.88rem;
		font-weight: 700;
		color: #0f172a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-status-pill {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 9999px;
		background: #e0f2fe;
		color: #0369a1;
		flex-shrink: 0;
	}

	.card-status-pill--recalled {
		background: #ffedd5;
		color: #c2410c;
	}

	.card-status-pill--delivered {
		background: #dcfce7;
		color: #15803d;
	}

	.card-message-snippet {
		margin: 0;
		font-size: 0.78rem;
		color: #64748b;
		line-height: 1.35;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-progress-bar {
		height: 6px;
		background: #e2e8f0;
		border-radius: 9999px;
		overflow: hidden;
	}

	.card-progress-fill {
		height: 100%;
		border-radius: 9999px;
		transition: width 0.3s ease;
	}

	.card-footer-stats {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.75rem;
		color: #64748b;
	}

	.card-eta-col {
		display: flex;
		align-items: center;
		gap: 4px;
		font-weight: 700;
		color: #0284c7;
	}

	.card-dist-val {
		font-weight: 600;
	}

	.card-actions-bar {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.3rem;
		padding-top: 0.5rem;
		border-top: 1px solid #f1f5f9;
	}

	.card-btn-focus {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 5px;
		background: #f1f5f9;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		font-size: 0.74rem;
		font-weight: 600;
		color: #334155;
		cursor: pointer;
	}

	.card-btn-focus:hover {
		background: #e2e8f0;
		color: #0f172a;
	}

	.card-btn-recall {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 8px;
		background: #fff7ed;
		border: 1px solid #fed7aa;
		border-radius: 6px;
		font-size: 0.74rem;
		font-weight: 700;
		color: #c2410c;
		cursor: pointer;
	}

	.card-btn-recall:hover {
		background: #ea580c;
		color: #ffffff;
	}

	.card-btn-conv {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		border-radius: 6px;
		color: #475569;
		text-decoration: none;
	}

	.card-btn-conv:hover {
		background: #e0f2fe;
		color: #0284c7;
		border-color: #bae6fd;
	}

	/* Empty State */
	.empty-flock-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 2.5rem 1rem;
		gap: 0.7rem;
	}

	.empty-flock-icon {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: #f1f5f9;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-flock-box h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 700;
		color: #0f172a;
	}

	.empty-flock-box p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.45;
		color: #64748b;
	}

	.empty-send-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0.55rem 1.1rem;
		background: #0284c7;
		color: #ffffff;
		border-radius: 9999px;
		font-size: 0.82rem;
		font-weight: 700;
		text-decoration: none;
		margin-top: 0.5rem;
		box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);
	}

	.empty-send-btn:hover {
		background: #0369a1;
	}

	/* Modal Backdrop */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.5);
		backdrop-filter: blur(4px);
		z-index: 100000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal-card {
		background: #ffffff;
		border-radius: 16px;
		padding: 1.4rem;
		max-width: 380px;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.65rem;
		box-shadow: 0 20px 35px rgba(0, 0, 0, 0.2);
	}

	.modal-alert-icon {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: #ffedd5;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal-card h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: #0f172a;
	}

	.modal-card p {
		margin: 0;
		font-size: 0.84rem;
		line-height: 1.45;
		color: #475569;
	}

	.modal-error-box {
		font-size: 0.78rem;
		color: #dc2626;
		background: #fef2f2;
		padding: 0.4rem 0.8rem;
		border-radius: 8px;
		width: 100%;
	}

	.modal-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
		width: 100%;
		margin-top: 0.4rem;
	}

	.btn-cancel {
		padding: 0.55rem;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: #f8fafc;
		color: #475569;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-recall-confirm {
		padding: 0.55rem;
		border: 1px solid #ea580c;
		border-radius: 8px;
		background: #ea580c;
		color: #ffffff;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3);
	}

	.btn-recall-confirm:hover {
		background: #c2410c;
	}

	@media (max-width: 900px) {
		.map-layout-grid {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr 280px;
		}

		.flights-sidebar {
			border-left: none;
			border-top: 1px solid #e2e8f0;
		}
	}
</style>
