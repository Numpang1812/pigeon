<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		MapPin,
		LoaderCircle,
		Search,
		Crosshair,
		Check,
		X,
		AlertCircle
	} from 'lucide-svelte';
	import 'leaflet/dist/leaflet.css';

	type Props = {
		/** Whether the user may close the gate and keep using the rest of the app. */
		dismissible?: boolean;
		/** Copy shown above the button, so /messages can explain itself differently. */
		reason?: string;
		initial_coords?: { lat: number; lng: number };
		on_saved?: () => void;
		on_dismiss?: () => void;
	};

	const {
		dismissible = true,
		reason = 'A pigeon needs to know where it is flying from. Choose your loft on the map, search a city, or use GPS.',
		initial_coords,
		on_saved,
		on_dismiss
	}: Props = $props();

	let map_element: HTMLDivElement | null = $state(null);
	let L_module = $state<typeof import('leaflet') | null>(null);
	let map_instance = $state<import('leaflet').Map | null>(null);
	let pin_marker = $state<import('leaflet').Marker | null>(null);

	let selected_coords = $state<{ lat: number; lng: number }>({
		lat: 11.5564,
		lng: 104.9282
	});

	$effect(() => {
		if (initial_coords) {
			selected_coords = { lat: initial_coords.lat, lng: initial_coords.lng };
		}
	});

	let search_query = $state('');
	let search_results = $state<Array<{ display_name: string; lat: string; lon: string }>>([]);
	let searching = $state(false);
	let show_dropdown = $state(false);

	let requesting_gps = $state(false);
	let saving = $state(false);
	let error_message = $state<string | null>(null);

	onMount(() => {
		if (browser) {
			import('leaflet').then((mod) => {
				L_module = mod.default || mod;
			});
		}
	});

	// Initialize Leaflet Map
	$effect(() => {
		if (!browser || !map_element || !L_module || map_instance) return;

		const L = L_module;
		const map = L.map(map_element, {
			center: [selected_coords.lat, selected_coords.lng],
			zoom: initial_coords ? 14 : 11,
			zoomControl: false,
			attributionControl: false
		});

		L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
			maxZoom: 19,
			subdomains: 'abcd'
		}).addTo(map);

		L.control.zoom({ position: 'topright' }).addTo(map);

		const loft_icon = L.divIcon({
			className: 'custom-loft-picker-icon',
			html: `
				<div class="loft-picker-pin">
					<div class="loft-picker-badge">🏠 Your Loft</div>
					<div class="loft-picker-dot"></div>
				</div>
			`,
			iconSize: [110, 44],
			iconAnchor: [55, 42]
		});

		const marker = L.marker([selected_coords.lat, selected_coords.lng], {
			icon: loft_icon,
			draggable: true
		}).addTo(map);

		marker.on('dragend', () => {
			const pos = marker.getLatLng();
			selected_coords = { lat: pos.lat, lng: pos.lng };
		});

		map.on('click', (e) => {
			selected_coords = { lat: e.latlng.lat, lng: e.latlng.lng };
			marker.setLatLng(e.latlng);
		});

		map_instance = map;
		pin_marker = marker;

		return () => {
			if (map_instance) {
				map_instance.remove();
				map_instance = null;
			}
		};
	});

	// Move marker and map center when selected_coords changes externally
	function set_location(lat: number, lng: number, zoom = 14) {
		selected_coords = { lat, lng };
		if (map_instance && pin_marker) {
			pin_marker.setLatLng([lat, lng]);
			map_instance.flyTo([lat, lng], zoom, { duration: 1.2 });
		}
	}

	async function handle_search(e: Event) {
		e.preventDefault();
		const query = search_query.trim();
		if (!query) return;

		searching = true;
		error_message = null;
		search_results = [];

		try {
			const res = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`
			);
			if (!res.ok) throw new Error('Search failed');
			const data = await res.json();
			search_results = data;
			show_dropdown = data.length > 0;
			if (data.length === 0) {
				error_message = 'No locations found. Try a different city or place name.';
			}
		} catch {
			error_message = 'Could not search location. Check connection or pick on map.';
		} finally {
			searching = false;
		}
	}

	function select_search_result(item: { display_name: string; lat: string; lon: string }) {
		const lat = parseFloat(item.lat);
		const lng = parseFloat(item.lon);
		set_location(lat, lng, 14);
		search_query = item.display_name.split(',')[0];
		show_dropdown = false;
	}

	function request_device_gps() {
		error_message = null;
		if (!('geolocation' in navigator)) {
			error_message = 'Geolocation is not supported by your browser.';
			return;
		}

		requesting_gps = true;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				requesting_gps = false;
				set_location(position.coords.latitude, position.coords.longitude, 16);
			},
			(err) => {
				requesting_gps = false;
				if (err.code === 1) {
					error_message = 'Location permission was denied. Please allow it or pick on the map.';
				} else {
					error_message = 'Could not read device location. You can click on the map to place your loft.';
				}
			},
			{ enableHighAccuracy: true, timeout: 15000 }
		);
	}

	async function save_loft() {
		error_message = null;
		saving = true;

		try {
			const response = await fetch('/api/pigeon/home', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lat: selected_coords.lat,
					lng: selected_coords.lng,
					accuracy_m: 10
				})
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				throw new Error(payload?.error === 'invalid_coords' ? 'Invalid coordinates' : 'Failed to save loft');
			}

			on_saved?.();
		} catch (err) {
			error_message = err instanceof Error ? err.message : 'Could not save your loft. Please try again.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="loft-gate" role="dialog" aria-modal="true" aria-labelledby="loft-gate-title">
	<!-- Backdrop -->
	<div
		class="loft-gate__backdrop"
		onclick={() => {
			if (dismissible) on_dismiss?.();
		}}
		role="presentation"
	></div>

	<!-- Modal Panel -->
	<div class="loft-gate__panel">
		<!-- Header -->
		<div class="loft-gate__header">
			<div class="loft-gate__title-wrap">
				<div class="loft-gate__icon-badge">
					<MapPin size={20} />
				</div>
				<div>
					<h2 id="loft-gate-title">Set Home Loft Location</h2>
					<p class="loft-gate__sub">{reason}</p>
				</div>
			</div>

			{#if dismissible}
				<button type="button" class="loft-gate__close-btn" onclick={() => on_dismiss?.()} aria-label="Close">
					<X size={18} />
				</button>
			{/if}
		</div>

		<!-- Search Bar & GPS Trigger -->
		<div class="loft-search-container">
			<form onsubmit={handle_search} class="loft-search-form">
				<div class="loft-search-input-wrap">
					<Search size={16} class="search-icon" />
					<input
						type="text"
						placeholder="Search city, address, or landmark..."
						bind:value={search_query}
						onfocus={() => {
							if (search_results.length > 0) show_dropdown = true;
						}}
					/>
					{#if search_query}
						<button
							type="button"
							class="clear-search-btn"
							onclick={() => {
								search_query = '';
								show_dropdown = false;
							}}
						>
							<X size={14} />
						</button>
					{/if}
				</div>

				<button type="submit" class="search-submit-btn" disabled={searching}>
					{#if searching}
						<LoaderCircle size={15} class="spin-icon" />
					{:else}
						Search
					{/if}
				</button>
			</form>

			<button
				type="button"
				class="gps-btn"
				onclick={request_device_gps}
				disabled={requesting_gps}
				title="Use device GPS"
			>
				{#if requesting_gps}
					<LoaderCircle size={15} class="spin-icon" />
					<span>Locating...</span>
				{:else}
					<Crosshair size={15} />
					<span>Use GPS</span>
				{/if}
			</button>

			<!-- Search Results Dropdown -->
			{#if show_dropdown && search_results.length > 0}
				<div class="search-dropdown">
					{#each search_results as item}
						<button
							type="button"
							class="dropdown-item"
							onclick={() => select_search_result(item)}
						>
							<MapPin size={14} class="dropdown-pin-icon" />
							<span class="dropdown-text">{item.display_name}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Interactive Map Canvas -->
		<div class="map-picker-canvas-wrap">
			<div bind:this={map_element} class="leaflet-picker-element"></div>
			<div class="map-hint-pill">
				<span>💡 Click or drag the loft pin to adjust</span>
			</div>
		</div>

		<!-- Coordinates Readout & Actions -->
		<div class="loft-coords-bar">
			<div class="coords-display">
				<span class="coords-label">Selected Loft Coordinates:</span>
				<span class="coords-val">{selected_coords.lat.toFixed(5)}, {selected_coords.lng.toFixed(5)}</span>
			</div>

			<div class="loft-modal-actions">
				{#if dismissible}
					<button type="button" class="btn-secondary" onclick={() => on_dismiss?.()} disabled={saving}>
						Cancel
					</button>
				{/if}
				<button type="button" class="btn-primary" onclick={save_loft} disabled={saving}>
					{#if saving}
						<LoaderCircle size={16} class="spin-icon" />
						<span>Saving Loft...</span>
					{:else}
						<Check size={16} />
						<span>Save This Loft</span>
					{/if}
				</button>
			</div>
		</div>

		{#if error_message}
			<div class="error-banner" role="alert">
				<AlertCircle size={16} />
				<span>{error_message}</span>
			</div>
		{/if}
	</div>
</div>

<style>
	.loft-gate {
		position: fixed;
		inset: 0;
		z-index: 2000;
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.loft-gate__backdrop {
		position: absolute;
		inset: 0;
		background: rgba(15, 23, 42, 0.6);
		backdrop-filter: blur(4px);
	}

	.loft-gate__panel {
		position: relative;
		width: min(600px, 100%);
		max-height: 90vh;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		border-radius: 1.25rem;
		padding: 1.25rem;
		box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		overflow-y: auto;
	}

	.loft-gate__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.loft-gate__title-wrap {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.loft-gate__icon-badge {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: #e0f2fe;
		color: #0284c7;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}

	h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
		color: #0f172a;
	}

	.loft-gate__sub {
		margin: 0.15rem 0 0;
		font-size: 0.8rem;
		color: #64748b;
		line-height: 1.4;
	}

	.loft-gate__close-btn {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		border: none;
		background: #f1f5f9;
		color: #64748b;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.loft-gate__close-btn:hover {
		background: #e2e8f0;
		color: #0f172a;
	}

	.loft-search-container {
		position: relative;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.loft-search-form {
		flex: 1;
		display: flex;
		gap: 0.4rem;
		min-width: 220px;
	}

	.loft-search-input-wrap {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
	}

	:global(.search-icon) {
		position: absolute;
		left: 10px;
		color: #94a3b8;
		pointer-events: none;
	}

	.loft-search-input-wrap input {
		width: 100%;
		padding: 0.45rem 1.8rem 0.45rem 2rem;
		font-size: 0.82rem;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		background: #f8fafc;
		color: #0f172a;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.loft-search-input-wrap input:focus {
		border-color: #0284c7;
		background: #ffffff;
	}

	.clear-search-btn {
		position: absolute;
		right: 6px;
		border: none;
		background: transparent;
		color: #94a3b8;
		cursor: pointer;
		padding: 2px;
		border-radius: 4px;
	}

	.search-submit-btn,
	.gps-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.78rem;
		font-weight: 600;
		padding: 0.45rem 0.8rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.search-submit-btn {
		background: #0284c7;
		color: #ffffff;
		border: none;
	}

	.search-submit-btn:hover:not(:disabled) {
		background: #0369a1;
	}

	.gps-btn {
		background: #f1f5f9;
		color: #334155;
		border: 1px solid #cbd5e1;
	}

	.gps-btn:hover:not(:disabled) {
		background: #e2e8f0;
		color: #0f172a;
	}

	.search-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		z-index: 100;
		background: #ffffff;
		border: 1px solid #cbd5e1;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		max-height: 180px;
		overflow-y: auto;
	}

	.dropdown-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		text-align: left;
		border: none;
		background: transparent;
		cursor: pointer;
		font-size: 0.78rem;
		color: #1e293b;
		border-bottom: 1px solid #f1f5f9;
	}

	.dropdown-item:hover {
		background: #f0f9ff;
		color: #0284c7;
	}

	:global(.dropdown-pin-icon) {
		color: #0284c7;
		flex-shrink: 0;
	}

	.dropdown-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.map-picker-canvas-wrap {
		position: relative;
		width: 100%;
		height: 280px;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid #cbd5e1;
	}

	.leaflet-picker-element {
		width: 100%;
		height: 100%;
		z-index: 1;
	}

	.map-hint-pill {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(15, 23, 42, 0.75);
		color: #ffffff;
		font-size: 0.72rem;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 9999px;
		pointer-events: none;
		z-index: 10;
		backdrop-filter: blur(2px);
	}

	/* Loft Marker Pin */
	:global(.custom-loft-picker-icon) {
		background: transparent !important;
		border: none !important;
	}

	:global(.loft-picker-pin) {
		display: flex;
		flex-direction: column;
		align-items: center;
		filter: drop-shadow(0 3px 6px rgba(15, 23, 42, 0.25));
	}

	:global(.loft-picker-badge) {
		background: #0284c7;
		color: #ffffff;
		padding: 3px 8px;
		border-radius: 9999px;
		font-size: 11px;
		font-weight: 700;
		border: 2px solid #ffffff;
		white-space: nowrap;
	}

	:global(.loft-picker-dot) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #0284c7;
		border: 2px solid #ffffff;
		margin-top: 2px;
	}

	.loft-coords-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding-top: 0.25rem;
	}

	.coords-display {
		display: flex;
		flex-direction: column;
	}

	.coords-label {
		font-size: 0.68rem;
		color: #64748b;
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.025em;
	}

	.coords-val {
		font-size: 0.85rem;
		font-weight: 700;
		color: #0f172a;
		font-variant-numeric: tabular-nums;
	}

	.loft-modal-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.btn-secondary,
	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.82rem;
		font-weight: 600;
		padding: 0.55rem 1rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-secondary {
		border: 1px solid #cbd5e1;
		background: transparent;
		color: #475569;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #f1f5f9;
		color: #0f172a;
	}

	.btn-primary {
		border: none;
		background: #0284c7;
		color: #ffffff;
		box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);
	}

	.btn-primary:hover:not(:disabled) {
		background: #0369a1;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #b91c1c;
		font-size: 0.78rem;
	}

	:global(.spin-icon) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
