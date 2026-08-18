<script lang="ts">
	import { ArrowLeft, Undo2, LoaderCircle } from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import FlightMap from '$lib/components/pigeon/FlightMap.svelte';
	import { epoch_from_sql, format_distance, format_duration } from '$lib/pigeon/clock';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	let recalling_id = $state<string | null>(null);
	let recall_error = $state<string | null>(null);

	const clock_offset = $derived(data.server_now - Date.now());

	function home_in(available_at: string): string {
		const available_ms = epoch_from_sql(available_at);
		if (available_ms === null) return '';

		return format_duration(available_ms - data.server_now);
	}

	async function recall(flight_id: string) {
		recalling_id = flight_id;
		recall_error = null;

		try {
			const response = await fetch(`/api/pigeon/flights/${flight_id}/recall`, { method: 'POST' });

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				recall_error =
					payload?.error === 'nothing_to_recall'
						? 'That pigeon has already made its deliveries. It is only flying home now.'
						: 'Could not recall that pigeon.';
				return;
			}

			await invalidateAll();
		} catch {
			recall_error = 'Could not reach the server.';
		} finally {
			recalling_id = null;
		}
	}
</script>

<svelte:head><title>The loft · Pigeon</title></svelte:head>

<header class="loft-head">
	<a class="loft-back" href={resolve('/messages')} aria-label="Back to conversations">
		<ArrowLeft size={18} />
	</a>
	<div>
		<h1>The loft</h1>
		<p>{data.flock.available} of {data.flock.size} pigeons resting</p>
	</div>
</header>

<div class="loft-scroll">
	{#if recall_error}
		<p class="loft-error" role="alert">{recall_error}</p>
	{/if}

	{#if data.flights.length === 0}
		<p class="loft-empty">
			Every pigeon is home. Send one and you can watch it cross the map from here.
		</p>
	{:else}
		{#each data.flights as flight (flight.id)}
			<article class="loft-card">
				<div class="loft-card-head">
					<div>
						<p class="loft-card-preview">{flight.preview || 'An image'}</p>
						<p class="loft-card-meta">
							{format_distance(flight.total_distance_km)} round trip · home in {home_in(
								flight.available_at
							)}
						</p>
					</div>

					<button
						type="button"
						class="pigeon-pill pigeon-pill--quiet"
						disabled={recalling_id === flight.id}
						onclick={() => recall(flight.id)}
					>
						{#if recalling_id === flight.id}
							<LoaderCircle size={14} class="loft-spinner" />
							Recalling
						{:else}
							<Undo2 size={14} />
							Recall
						{/if}
					</button>
				</div>

				<FlightMap
					route={flight.route}
					departed_at={epoch_from_sql(flight.departed_at) ?? data.server_now}
					{clock_offset}
					compact
				/>
			</article>
		{/each}
	{/if}
</div>

<style>
	.loft-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e2e8f0;
		background: #ffffff;
	}

	.loft-back {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 999px;
		background: #f1f5f9;
		color: #475569;
		flex-shrink: 0;
	}

	.loft-head h1 {
		margin: 0;
		font-size: 1rem;
		color: #0f172a;
	}

	.loft-head p {
		margin: 0.1rem 0 0;
		font-size: 0.78rem;
		color: #64748b;
	}

	.loft-scroll {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.loft-card {
		border: 1px solid #e2e8f0;
		border-radius: 16px;
		padding: 0.85rem;
		background: #ffffff;
	}

	.loft-card-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.loft-card-preview {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: #0f172a;
	}

	.loft-card-meta {
		margin: 0.15rem 0 0;
		font-size: 0.78rem;
		color: #64748b;
	}

	.loft-empty,
	.loft-error {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.55;
		color: #64748b;
	}

	.loft-error {
		padding: 0.6rem 0.85rem;
		border: 1px solid #fecaca;
		border-radius: 12px;
		background: #fef2f2;
		color: #b91c1c;
	}

	:global(.loft-spinner) {
		animation: loft-spin 1s linear infinite;
	}

	@keyframes loft-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
