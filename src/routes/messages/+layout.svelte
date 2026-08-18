<script lang="ts">
	import '$lib/components/styles/pigeon.css';
	import { Plus, Bird } from 'lucide-svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import ConversationList from '$lib/components/pigeon/ConversationList.svelte';
	import FlockIndicator from '$lib/components/pigeon/FlockIndicator.svelte';
	import NewFlightModal from '$lib/components/pigeon/NewFlightModal.svelte';
	import HomeLocationGate from '$lib/components/pigeon/HomeLocationGate.svelte';
	import {
		schedule_arrival,
		set_unread_conversations,
		start_arrival_watch
	} from '$lib/pigeon/arrivals';
	import { epoch_from_sql } from '$lib/pigeon/clock';
	import type { LayoutData } from './$types';

	const { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	let showing_new_flight = $state(false);

	const is_thread_open = $derived(page.url.pathname !== '/messages');
	const active_id = $derived((page.params.conversation_id as string | undefined) ?? null);

	// So an empty coop shows when the next bird lands, not just "0 of 10".
	const next_available_at_ms = $derived(epoch_from_sql(data.flock.next_available_at));

	// One watcher for the whole feature: it owns the single arrival timer and
	// keeps the navigation badge in step. No polling anywhere.
	$effect(() => start_arrival_watch());

	$effect(() => {
		set_unread_conversations(data.unread_conversations);
		schedule_arrival(data.next_arrival_at, data.server_now);
	});

	function open_conversation(conversation_id: string) {
		goto(`${resolve('/messages')}/${conversation_id}`);
	}
</script>

<svelte:head><title>Pigeons · Pigeon</title></svelte:head>

{#if data.home_required}
	<HomeLocationGate
		dismissible={false}
		reason="Pigeon post needs your location once. Distances are measured from your loft, and a pigeon cannot fly to or from a loft that does not exist yet."
		on_saved={async () => {
			await invalidateAll();
		}}
	/>
{:else}
	<div class="pigeon-shell" class:pigeon-shell--thread-open={is_thread_open}>
		<aside class="pigeon-list-pane">
			<div class="pigeon-list-head">
				<h1 class="pigeon-list-title">Pigeons</h1>
				<div class="pigeon-list-actions">
					<FlockIndicator
						size={data.flock.size}
						available={data.flock.available}
						{next_available_at_ms}
						server_now={data.server_now}
					/>
					<button
						type="button"
						class="pigeon-pill"
						onclick={() => {
							showing_new_flight = true;
						}}
					>
						<Plus size={16} />
						Send
					</button>
				</div>
			</div>

			<div class="pigeon-list-scroll">
				<ConversationList
					conversations={data.conversations}
					{active_id}
					on_select={open_conversation}
				/>
			</div>

			<a class="pigeon-loft-link" href={`${resolve('/messages')}/flock`}>
				<Bird size={16} />
				Visit the loft
			</a>
		</aside>

		<section class="pigeon-thread-pane">
			{@render children()}
		</section>
	</div>

	{#if showing_new_flight}
		<NewFlightModal
			on_close={() => {
				showing_new_flight = false;
			}}
			on_created={async (conversation_id) => {
				showing_new_flight = false;
				await invalidateAll();
				open_conversation(conversation_id);
			}}
		/>
	{/if}
{/if}

<style>
	.pigeon-list-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pigeon-loft-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.7rem;
		border-top: 1px solid #e2e8f0;
		font-size: 0.82rem;
		font-weight: 600;
		color: #475569;
		text-decoration: none;
	}

	.pigeon-loft-link:hover {
		background: #f1f5f9;
		color: #0284c7;
	}
</style>
