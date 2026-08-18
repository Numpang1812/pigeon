<script lang="ts">
	import { onMount } from 'svelte';
	import {
		position_at,
		progress_at,
		project,
		route_bounds,
		type RouteLeg
	} from '$lib/pigeon/flight';

	type Props = {
		/** Route legs with map-fuzzed coordinates, as stored in pigeon_flight.route_json. */
		route: RouteLeg[];
		/** Departure time, epoch milliseconds on the server clock. */
		departed_at: number;
		/** Difference between the server clock and this browser's clock. */
		clock_offset?: number;
		/** Display names for the loft at the end of each leg, keyed by recipient id. */
		labels?: Record<string, string>;
		/** Name for the sender's own loft. */
		origin_label?: string;
		compact?: boolean;
	};

	const {
		route,
		departed_at,
		clock_offset = 0,
		labels = {},
		origin_label = 'Your loft',
		compact = false
	}: Props = $props();

	// The map is drawn in an equirectangular (plate carree) space: one degree of
	// longitude is a constant number of units across, one degree of latitude a
	// constant number down. A straight line here is a straight line in lat/lng,
	// which is exactly how the pigeon flies.
	const view_width = 1000;
	const view_height = 500;

	let now = $state(Date.now());
	let reduced_motion = $state(false);

	// A pigeon crossing an ocean moves a few pixels an hour, so the marker alone
	// reads as static. The numeric readout carries the information.
	onMount(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		reduced_motion = query.matches;

		if (query.matches) return;

		let frame = 0;
		const tick = () => {
			now = Date.now();
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(frame);
	});

	const server_now = $derived(now + clock_offset);
	const current = $derived(position_at(route, departed_at, server_now));
	const progress = $derived(progress_at(route, departed_at, server_now));

	/**
	 * Viewport fitted to the route with padding, so a short hop is not an
	 * invisible dot on a whole-world map.
	 */
	const view_box = $derived.by(() => {
		const bounds = route_bounds(route);
		const top_left = project({ lat: bounds.max_lat, lng: bounds.min_lng }, view_width, view_height);
		const bottom_right = project(
			{ lat: bounds.min_lat, lng: bounds.max_lng },
			view_width,
			view_height
		);

		const width = Math.max(bottom_right.x - top_left.x, 60);
		const height = Math.max(bottom_right.y - top_left.y, 30);
		const padding = Math.max(width, height) * 0.35 + 20;

		return {
			x: top_left.x - padding,
			y: top_left.y - padding,
			width: width + padding * 2,
			height: height + padding * 2
		};
	});

	const view_box_attr = $derived(
		`${view_box.x} ${view_box.y} ${view_box.width} ${view_box.height}`
	);

	/** Scale strokes and markers so they stay legible whatever the zoom. */
	const unit = $derived(Math.max(view_box.width, view_box.height) / 100);

	type Segment = { x1: number; y1: number; x2: number; y2: number; flown: boolean };

	/**
	 * Each leg becomes its own segment, split at the point the bird has reached so
	 * the flown part can be drawn solid and the rest dashed.
	 *
	 * A leg that crosses the antimeridian is skipped rather than drawn, because a
	 * straight line between +179 and -179 would streak across the entire map.
	 */
	const segments = $derived.by(() => {
		const built: Segment[] = [];

		route.forEach((leg, index) => {
			if (Math.abs(leg.to.lng - leg.from.lng) > 180) return;

			const from = project(leg.from, view_width, view_height);
			const to = project(leg.to, view_width, view_height);

			if (index < current.leg_index) {
				built.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, flown: true });
				return;
			}

			if (index > current.leg_index) {
				built.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, flown: false });
				return;
			}

			const split = project(current.coords, view_width, view_height);
			built.push({ x1: from.x, y1: from.y, x2: split.x, y2: split.y, flown: true });
			built.push({ x1: split.x, y1: split.y, x2: to.x, y2: to.y, flown: false });
		});

		return built;
	});

	const lofts = $derived.by(() => {
		const points = [
			{
				point: project(route[0]?.from ?? { lat: 0, lng: 0 }, view_width, view_height),
				label: origin_label
			}
		];

		for (const leg of route) {
			if (leg.recipient_id === null) continue;
			points.push({
				point: project(leg.to, view_width, view_height),
				label: labels[leg.recipient_id] ?? 'Their loft'
			});
		}

		return points;
	});

	const pigeon = $derived(project(current.coords, view_width, view_height));

	/** Rotate the bird to face along the segment it is currently flying. */
	const heading = $derived.by(() => {
		const leg = route[current.leg_index];
		if (!leg) return 0;

		const from = project(leg.from, view_width, view_height);
		const to = project(leg.to, view_width, view_height);

		return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
	});

	/** Graticule lines that fall inside the current viewport. */
	const graticule = $derived.by(() => {
		const meridians: number[] = [];
		const parallels: number[] = [];

		for (let lng = -180; lng <= 180; lng += 15) {
			const x = project({ lat: 0, lng }, view_width, view_height).x;
			if (x >= view_box.x && x <= view_box.x + view_box.width) meridians.push(x);
		}

		for (let lat = -90; lat <= 90; lat += 15) {
			const y = project({ lat, lng: 0 }, view_width, view_height).y;
			if (y >= view_box.y && y <= view_box.y + view_box.height) parallels.push(y);
		}

		return { meridians, parallels };
	});
</script>

<div class="flight-map" class:flight-map--compact={compact}>
	<svg viewBox={view_box_attr} role="img" aria-label="Pigeon flight path">
		<rect
			x={view_box.x}
			y={view_box.y}
			width={view_box.width}
			height={view_box.height}
			class="flight-map__ocean"
		/>

		<!--
			A graticule stands in for coastlines. Drop a plate-carree world outline
			into src/lib/assets/ and render it here, sized to the same
			0 0 1000 500 space, and every position below lines up with it — the
			projection maths does not change.
		-->
		<g class="flight-map__graticule">
			{#each graticule.meridians as x (x)}
				<line x1={x} y1={view_box.y} x2={x} y2={view_box.y + view_box.height} />
			{/each}
			{#each graticule.parallels as y (y)}
				<line x1={view_box.x} y1={y} x2={view_box.x + view_box.width} y2={y} />
			{/each}
		</g>

		{#each segments as segment, index (index)}
			<line
				x1={segment.x1}
				y1={segment.y1}
				x2={segment.x2}
				y2={segment.y2}
				class="flight-map__leg"
				class:flight-map__leg--flown={segment.flown}
				stroke-width={unit * 0.45}
				stroke-dasharray={segment.flown ? 'none' : `${unit * 1.6} ${unit * 1.4}`}
			/>
		{/each}

		{#each lofts as loft, index (index)}
			<g class="flight-map__loft">
				<circle cx={loft.point.x} cy={loft.point.y} r={unit * 1.1} />
				<text x={loft.point.x} y={loft.point.y - unit * 2.2} font-size={unit * 3}>
					{loft.label}
				</text>
			</g>
		{/each}

		<g
			class="flight-map__pigeon"
			transform={`translate(${pigeon.x} ${pigeon.y}) rotate(${heading})`}
		>
			<circle r={unit * 1.5} />
			<path
				d={`M ${-unit * 1.2} ${-unit * 1.4} L ${unit * 2.6} 0 L ${-unit * 1.2} ${unit * 1.4} Z`}
			/>
		</g>
	</svg>

	<div class="flight-map__readout">
		<span class="flight-map__progress">{Math.round(progress * 100)}% flown</span>
		{#if reduced_motion}
			<span class="flight-map__static">Position shown at page load</span>
		{/if}
	</div>
</div>

<style>
	.flight-map {
		position: relative;
		border: 1px solid #cbd5e1;
		border-radius: 16px;
		overflow: hidden;
		background: #f8fbff;
	}

	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 420px;
	}

	.flight-map--compact svg {
		max-height: 200px;
	}

	.flight-map__ocean {
		fill: #eff6ff;
	}

	.flight-map__graticule line {
		stroke: #dbeafe;
		stroke-width: 0.5;
	}

	.flight-map__leg {
		stroke: #94a3b8;
		stroke-linecap: round;
	}

	.flight-map__leg--flown {
		stroke: #0ea5e9;
	}

	.flight-map__loft circle {
		fill: #ffffff;
		stroke: #0f172a;
		stroke-width: 0.8;
	}

	.flight-map__loft text {
		fill: #475569;
		text-anchor: middle;
		font-weight: 600;
	}

	.flight-map__pigeon circle {
		fill: rgba(14, 165, 233, 0.18);
	}

	.flight-map__pigeon path {
		fill: #0ea5e9;
	}

	.flight-map__readout {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.85rem;
		border-top: 1px solid #e2e8f0;
		background: #ffffff;
		font-size: 0.8rem;
		color: #64748b;
	}

	.flight-map__progress {
		font-weight: 600;
		color: #0f172a;
	}
</style>
