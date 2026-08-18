<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { BadgeCheck, LoaderCircle, X } from 'lucide-svelte';
	import { format_distance, format_duration } from '$lib/pigeon/clock';

	type Friend = {
		id: string;
		name: string;
		handle: string;
		avatar: string;
		verified: boolean;
		distance_km: number | null;
		flight_ms: number | null;
	};

	type Props = {
		on_close: () => void;
		on_created: (conversation_id: string) => void;
	};

	const { on_close, on_created }: Props = $props();

	let mode = $state<'direct' | 'group'>('direct');
	let search = $state('');
	let friends = $state<Friend[]>([]);
	let loading = $state(true);
	let creating = $state(false);
	let error_message = $state<string | null>(null);
	let selected_ids = $state<string[]>([]);
	let group_title = $state('');

	let search_timer: ReturnType<typeof setTimeout> | undefined;

	const min_group_members = 2;
	const max_group_members = 20;

	const can_create = $derived(
		mode === 'direct'
			? selected_ids.length === 1
			: selected_ids.length >= min_group_members && selected_ids.length <= max_group_members
	);

	$effect(() => {
		load_friends('');

		return () => clearTimeout(search_timer);
	});

	async function load_friends(query: string) {
		loading = true;
		try {
			const response = await fetch(`/api/pigeon/friends?q=${encodeURIComponent(query)}`);
			if (!response.ok) {
				error_message = 'Could not load your friends.';
				return;
			}
			friends = (await response.json()).friends;
		} catch {
			error_message = 'Could not reach the server.';
		} finally {
			loading = false;
		}
	}

	// Debounced the same way the navbar user search is.
	function handle_search(event: Event) {
		search = (event.currentTarget as HTMLInputElement).value;
		clearTimeout(search_timer);
		search_timer = setTimeout(() => load_friends(search), 300);
	}

	function toggle(friend_id: string) {
		if (mode === 'direct') {
			selected_ids = selected_ids[0] === friend_id ? [] : [friend_id];
			return;
		}

		selected_ids = selected_ids.includes(friend_id)
			? selected_ids.filter((id) => id !== friend_id)
			: [...selected_ids, friend_id];
	}

	function switch_mode(next: 'direct' | 'group') {
		mode = next;
		selected_ids = [];
	}

	async function create() {
		if (!can_create || creating) return;

		creating = true;
		error_message = null;

		try {
			const response = await fetch('/api/pigeon/conversations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(
					mode === 'direct'
						? { kind: 'direct', user_id: selected_ids[0] }
						: { kind: 'group', member_ids: selected_ids, title: group_title.trim() || null }
				)
			});

			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				error_message = describe_error(payload?.error);
				return;
			}

			on_created(payload.conversation_id);
		} catch {
			error_message = 'Could not reach the server.';
		} finally {
			creating = false;
		}
	}

	function describe_error(code: unknown): string {
		if (code === 'not_mutual_follow')
			return 'You can only send pigeons to people who follow you back.';
		if (code === 'recipient_home_unset') return 'Someone you picked has not set a home loft yet.';
		if (code === 'group_size_out_of_range') {
			return `A group needs between ${min_group_members} and ${max_group_members} others.`;
		}
		if (code === 'cannot_message_yourself')
			return 'A pigeon will not carry a message to its own loft.';
		return 'Could not start that conversation.';
	}

	function describe_cost(friend: Friend): string {
		if (friend.flight_ms === null) return 'Distance unknown';

		return `${format_distance(friend.distance_km)} · ${format_duration(friend.flight_ms)} each way`;
	}

	function handle_backdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) on_close();
	}

	function handle_keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') on_close();
	}
</script>

<svelte:window onkeydown={handle_keydown} />

<!-- eslint-disable-next-line svelte/no-static-element-interactions -->
<div
	class="flight-modal-backdrop"
	role="presentation"
	onclick={handle_backdrop}
	transition:fade={{ duration: 150 }}
>
	<div
		class="flight-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="new-flight-title"
		transition:scale={{ duration: 180, start: 0.96 }}
	>
		<header class="flight-modal-head">
			<h2 id="new-flight-title">Send a pigeon</h2>
			<button type="button" aria-label="Close" onclick={on_close}><X size={18} /></button>
		</header>

		<div class="flight-modal-tabs" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'direct'}
				class:flight-tab--active={mode === 'direct'}
				onclick={() => switch_mode('direct')}
			>
				One friend
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={mode === 'group'}
				class:flight-tab--active={mode === 'group'}
				onclick={() => switch_mode('group')}
			>
				A group
			</button>
		</div>

		<div class="flight-modal-body">
			{#if mode === 'group'}
				<input
					class="flight-modal-title-input"
					type="text"
					placeholder="Group name (optional)"
					bind:value={group_title}
					maxlength="80"
				/>
				<p class="flight-modal-note">
					One pigeon carries the message to everyone, nearest loft first — so the last person waits
					for the whole route.
				</p>
			{/if}

			<input
				class="flight-modal-search"
				type="search"
				placeholder="Search friends"
				value={search}
				oninput={handle_search}
			/>

			{#if loading}
				<p class="flight-modal-state"><LoaderCircle size={16} class="flight-spinner" /> Loading</p>
			{:else if friends.length === 0}
				<p class="flight-modal-state">
					No one yet. You can only send pigeons to people who follow you back and have set a home
					loft.
				</p>
			{:else}
				<ul class="flight-friend-list">
					{#each friends as friend (friend.id)}
						<li>
							<button
								type="button"
								class="flight-friend"
								class:flight-friend--selected={selected_ids.includes(friend.id)}
								onclick={() => toggle(friend.id)}
							>
								<img src={friend.avatar || '/default-avatar.svg'} alt={friend.name} />
								<span class="flight-friend-text">
									<span class="flight-friend-name">
										{friend.name}
										{#if friend.verified}
											<BadgeCheck size={14} fill="#0ea5e9" color="white" />
										{/if}
									</span>
									<span class="flight-friend-handle">@{friend.handle}</span>
								</span>
								<span class="flight-friend-cost">{describe_cost(friend)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<footer class="flight-modal-foot">
			{#if error_message}
				<p class="flight-modal-error" role="alert">{error_message}</p>
			{/if}
			<button type="button" class="pigeon-pill" disabled={!can_create || creating} onclick={create}>
				{#if creating}
					<LoaderCircle size={16} class="flight-spinner" />
					Opening
				{:else}
					Start
				{/if}
			</button>
		</footer>
	</div>
</div>

<style>
	.flight-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1500;
		display: grid;
		place-items: center;
		padding: 1.5rem;
		background: rgba(15, 23, 42, 0.5);
	}

	.flight-modal {
		display: flex;
		flex-direction: column;
		width: min(520px, 100%);
		max-height: min(680px, 90vh);
		border-radius: 1.25rem;
		background: #ffffff;
		overflow: hidden;
	}

	.flight-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #e2e8f0;
	}

	.flight-modal-head h2 {
		margin: 0;
		font-size: 1.05rem;
		color: #0f172a;
	}

	.flight-modal-head button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 999px;
		background: #f1f5f9;
		color: #475569;
		cursor: pointer;
	}

	.flight-modal-tabs {
		display: flex;
		gap: 0.4rem;
		padding: 0.75rem 1.25rem 0;
	}

	.flight-modal-tabs button {
		padding: 0.4rem 0.85rem;
		border: 1px solid #cbd5e1;
		border-radius: 999px;
		background: transparent;
		font-size: 0.85rem;
		color: #475569;
		cursor: pointer;
	}

	.flight-tab--active {
		border-color: #0ea5e9;
		background: #e0f2fe;
		color: #0284c7;
		font-weight: 600;
	}

	.flight-modal-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 0.75rem 1.25rem 1rem;
	}

	.flight-modal-search,
	.flight-modal-title-input {
		width: 100%;
		padding: 0.55rem 0.75rem;
		margin-bottom: 0.6rem;
		border: 1px solid #cbd5e1;
		border-radius: 999px;
		font: inherit;
		font-size: 0.9rem;
	}

	.flight-modal-note {
		margin: 0 0 0.75rem;
		font-size: 0.78rem;
		line-height: 1.5;
		color: #64748b;
	}

	.flight-friend-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.flight-friend {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		width: 100%;
		padding: 0.55rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 12px;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.flight-friend:hover {
		background: #f1f5f9;
	}

	.flight-friend--selected {
		border-color: #0ea5e9;
		background: #e0f2fe;
	}

	.flight-friend img {
		width: 38px;
		height: 38px;
		border-radius: 999px;
		object-fit: cover;
	}

	.flight-friend-text {
		flex: 1;
		min-width: 0;
	}

	.flight-friend-name {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.9rem;
		font-weight: 600;
		color: #0f172a;
	}

	.flight-friend-handle {
		font-size: 0.78rem;
		color: #64748b;
	}

	.flight-friend-cost {
		flex-shrink: 0;
		font-size: 0.72rem;
		text-align: right;
		color: #0284c7;
		font-weight: 600;
	}

	.flight-modal-state {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.75rem 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #64748b;
	}

	.flight-modal-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1.25rem;
		border-top: 1px solid #e2e8f0;
	}

	.flight-modal-error {
		margin: 0;
		font-size: 0.8rem;
		color: #b91c1c;
	}

	:global(.flight-spinner) {
		animation: flight-spin 1s linear infinite;
	}

	@keyframes flight-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 640px) {
		.flight-modal {
			max-height: 100vh;
			border-radius: 0;
		}

		.flight-modal-backdrop {
			padding: 0;
		}
	}
</style>
