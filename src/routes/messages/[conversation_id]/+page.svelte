<script lang="ts">
	import { untrack } from 'svelte';
	import { ArrowLeft, ArrowDown, BadgeCheck, Map as MapIcon, Users } from 'lucide-svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import GroupMembersPanel from '$lib/components/pigeon/GroupMembersPanel.svelte';
	import MessageBubble from '$lib/components/pigeon/MessageBubble.svelte';
	import PigeonComposer from '$lib/components/pigeon/PigeonComposer.svelte';
	import FlightMap from '$lib/components/pigeon/FlightMap.svelte';
	import { epoch_from_sql, format_distance, format_duration } from '$lib/pigeon/clock';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	let showing_map = $state(true);
	let showing_members = $state(false);

	let scroll_element = $state<HTMLElement>();
	/** Whether the reader is at the bottom, and so wants to follow new arrivals. */
	let is_pinned_to_bottom = $state(true);
	let has_unseen_below = $state(false);

	const pin_threshold_px = 120;

	const title = $derived(
		data.conversation.title ??
			(data.conversation.participants.length === 1
				? data.conversation.participants[0].name
				: data.conversation.participants.map((participant) => participant.name).join(', '))
	);

	const recipient_names = $derived(
		Object.fromEntries(data.recipients.map((recipient) => [recipient.id, recipient.name]))
	);

	const next_available_at_ms = $derived(epoch_from_sql(data.flock.next_available_at));

	/** The newest message still carrying a bird, so the map has something to draw. */
	const active_flight = $derived.by(() => {
		const in_flight = data.messages.filter(
			(message) =>
				message.is_own &&
				message.flight !== null &&
				message.flight.status === 'in_flight' &&
				(epoch_from_sql(message.flight.available_at) ?? 0) > data.server_now
		);

		return in_flight.at(-1)?.flight ?? null;
	});

	const active_flight_departed_ms = $derived(
		active_flight === null ? null : epoch_from_sql(active_flight.departed_at)
	);

	type ThreadMessage = PageData['messages'][number];

	type ThreadItem =
		| { kind: 'divider'; key: string; label: string }
		| { kind: 'message'; key: string; message: ThreadMessage };

	/** Human label for a day boundary: Today, Yesterday, or the date. */
	function day_label(day_ms: number): string {
		const today = new Date(data.server_now);
		const day = new Date(day_ms);

		if (day.toDateString() === today.toDateString()) return 'Today';

		const yesterday = new Date(data.server_now - 86_400_000);
		if (day.toDateString() === yesterday.toDateString()) return 'Yesterday';

		return day.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: day.getFullYear() === today.getFullYear() ? undefined : 'numeric'
		});
	}

	/**
	 * Messages with a divider inserted whenever the day changes.
	 *
	 * Days matter more here than in a chat app: consecutive messages can easily
	 * be a week apart, so without a marker the thread reads as if it all happened
	 * at once.
	 */
	const thread_items = $derived.by(() => {
		const items: ThreadItem[] = [];
		let previous_day = '';

		for (const message of data.messages) {
			const visible_ms = epoch_from_sql(message.visible_at);

			if (visible_ms !== null) {
				const day = new Date(visible_ms).toDateString();
				if (day !== previous_day) {
					items.push({ kind: 'divider', key: `divider-${day}`, label: day_label(visible_ms) });
					previous_day = day;
				}
			}

			items.push({ kind: 'message', key: message.id, message });
		}

		return items;
	});

	function handle_scroll() {
		if (!scroll_element) return;

		const distance_from_bottom =
			scroll_element.scrollHeight - scroll_element.scrollTop - scroll_element.clientHeight;

		is_pinned_to_bottom = distance_from_bottom < pin_threshold_px;
		if (is_pinned_to_bottom) has_unseen_below = false;
	}

	function scroll_to_bottom(behavior: ScrollBehavior = 'auto') {
		scroll_element?.scrollTo({ top: scroll_element.scrollHeight, behavior });
		is_pinned_to_bottom = true;
		has_unseen_below = false;
	}

	// Follow new arrivals only while the reader is already at the bottom, so a
	// pigeon landing mid-scroll does not yank them away from what they are reading.
	$effect(() => {
		const latest_key = data.messages.at(-1)?.id ?? '';

		untrack(() => {
			if (!scroll_element) return;

			if (is_pinned_to_bottom) {
				scroll_to_bottom();
			} else if (latest_key) {
				has_unseen_below = true;
			}
		});
	});

	const subtitle = $derived.by(() => {
		if (data.conversation.kind === 'group') {
			return `${data.recipients.length + 1} lofts · one pigeon visits each in turn`;
		}
		if (!data.nearest || data.nearest.flight_ms === null) return 'Distance unknown';

		return `${format_distance(data.nearest.distance_km)} away · ${format_duration(data.nearest.flight_ms)} each way`;
	});
</script>

<svelte:head><title>{title} · Pigeon</title></svelte:head>

<header class="thread-head">
	<a class="thread-back" href={resolve('/messages')} aria-label="Back to conversations">
		<ArrowLeft size={18} />
	</a>

	<div class="thread-title-block">
		<h1>
			{title}
			{#if data.conversation.kind === 'direct' && data.conversation.participants[0]?.verified}
				<BadgeCheck size={15} fill="#0ea5e9" color="white" />
			{/if}
		</h1>
		<p>{subtitle}</p>
	</div>

	<!-- Shown for direct conversations too: leaving is allowed anywhere, and this
	     panel is the only route to it. -->
	<button
		type="button"
		class="thread-head-action"
		aria-pressed={showing_members}
		onclick={() => {
			showing_members = !showing_members;
		}}
	>
		<Users size={16} />
		{data.conversation.kind === 'group' ? 'Members' : 'Details'}
	</button>

	{#if active_flight}
		<button
			type="button"
			class="thread-head-action"
			aria-pressed={showing_map}
			onclick={() => {
				showing_map = !showing_map;
			}}
		>
			<MapIcon size={16} />
			{showing_map ? 'Hide map' : 'Show map'}
		</button>
	{/if}
</header>

{#if showing_members}
	<GroupMembersPanel
		conversation_id={data.conversation.id}
		kind={data.conversation.kind}
		participants={data.recipients}
		on_changed={async () => {
			await invalidateAll();
		}}
		on_close={() => {
			showing_members = false;
		}}
	/>
{/if}

{#if active_flight && active_flight_departed_ms !== null && showing_map}
	<div class="thread-map">
		<FlightMap
			route={active_flight.route}
			departed_at={active_flight_departed_ms}
			clock_offset={data.server_now - Date.now()}
			labels={recipient_names}
			compact
		/>
	</div>
{/if}

<div class="thread-scroll-wrap">
	<div class="thread-scroll" bind:this={scroll_element} onscroll={handle_scroll}>
		{#if thread_items.length === 0}
			<p class="thread-empty">
				Nothing has landed yet. Anything you send will take as long as the distance demands.
			</p>
		{:else}
			{#each thread_items as item (item.key)}
				{#if item.kind === 'divider'}
					<p class="thread-divider"><span>{item.label}</span></p>
				{:else}
					<MessageBubble
						body={item.message.body}
						is_own={item.message.is_own}
						visible_at={item.message.visible_at}
						sender={item.message.sender}
						attachments={item.message.attachments}
						deliveries={item.message.deliveries}
						server_now={data.server_now}
						{recipient_names}
					/>
				{/if}
			{/each}
		{/if}
	</div>

	{#if has_unseen_below}
		<button type="button" class="thread-jump" onclick={() => scroll_to_bottom('smooth')}>
			<ArrowDown size={14} />
			A pigeon landed
		</button>
	{/if}
</div>

<PigeonComposer
	conversation_id={data.conversation.id}
	can_send={data.conversation.can_send}
	block_reason={data.conversation.block_reason}
	pigeons_available={data.flock.available}
	{next_available_at_ms}
	nearest_distance_km={data.nearest?.distance_km ?? null}
	nearest_flight_ms={data.nearest?.flight_ms ?? null}
	nearest_label={data.conversation.kind === 'group' ? (data.nearest?.name ?? null) : null}
	server_now={data.server_now}
	on_sent={async () => {
		await invalidateAll();
	}}
/>

<style>
	.thread-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #e2e8f0;
		background: #ffffff;
	}

	.thread-back {
		display: none;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 999px;
		background: #f1f5f9;
		color: #475569;
		flex-shrink: 0;
	}

	.thread-title-block {
		flex: 1;
		min-width: 0;
	}

	.thread-title-block h1 {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0;
		font-size: 1rem;
		color: #0f172a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.thread-title-block p {
		margin: 0.1rem 0 0;
		font-size: 0.78rem;
		color: #64748b;
	}

	.thread-head-action {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 999px;
		background: transparent;
		font-size: 0.78rem;
		color: #475569;
		cursor: pointer;
		flex-shrink: 0;
	}

	.thread-head-action[aria-pressed='true'] {
		border-color: #0ea5e9;
		background: #e0f2fe;
		color: #0284c7;
	}

	.thread-map {
		padding: 0.75rem 1rem 0;
	}

	.thread-scroll-wrap {
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	.thread-scroll {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem;
	}

	.thread-divider {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0.5rem 0;
		font-size: 0.72rem;
		font-weight: 600;
		color: #94a3b8;
	}

	.thread-divider::before,
	.thread-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: #e2e8f0;
	}

	.thread-jump {
		position: absolute;
		bottom: 0.75rem;
		left: 50%;
		transform: translateX(-50%);
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.85rem;
		border: none;
		border-radius: 999px;
		background: #0ea5e9;
		color: #ffffff;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
	}

	.thread-empty {
		margin: auto;
		max-width: 34ch;
		text-align: center;
		font-size: 0.88rem;
		line-height: 1.55;
		color: #64748b;
	}

	@media (max-width: 900px) {
		.thread-back {
			display: grid;
		}
	}
</style>
