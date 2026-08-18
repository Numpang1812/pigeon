<script lang="ts">
	import { format_duration } from '$lib/pigeon/clock';

	type Props = {
		size: number;
		available: number;
		next_available_at_ms?: number | null;
		server_now: number;
	};

	const { size, available, next_available_at_ms = null, server_now }: Props = $props();

	const is_empty = $derived(available <= 0);

	const wait_label = $derived.by(() => {
		if (!is_empty || next_available_at_ms === null) return null;

		return format_duration(next_available_at_ms - server_now);
	});
</script>

<div class="flock" class:flock--empty={is_empty} title="Pigeons resting in your loft">
	<span class="flock-count">{available}/{size}</span>
	<span class="flock-label">
		{#if wait_label}
			next in {wait_label}
		{:else}
			in the loft
		{/if}
	</span>
</div>

<style>
	.flock {
		display: inline-flex;
		align-items: baseline;
		gap: 0.35rem;
		padding: 0.3rem 0.65rem;
		border: 1px solid #cbd5e1;
		border-radius: 999px;
		background: #ffffff;
		white-space: nowrap;
	}

	.flock--empty {
		border-color: #fde68a;
		background: #fffbeb;
	}

	.flock-count {
		font-size: 0.85rem;
		font-weight: 700;
		color: #0f172a;
	}

	.flock--empty .flock-count {
		color: #92400e;
	}

	.flock-label {
		font-size: 0.72rem;
		color: #64748b;
	}
</style>
