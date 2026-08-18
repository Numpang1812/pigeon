<script lang="ts">
	import { BadgeCheck, LoaderCircle, LogOut, UserPlus, X } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { format_distance, format_duration } from '$lib/pigeon/clock';

	type Participant = {
		id: string;
		name: string;
		handle: string;
		avatar: string;
		verified: boolean;
		distance_km?: number | null;
		flight_ms?: number | null;
	};

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
		conversation_id: string;
		kind: string;
		participants: Participant[];
		on_changed: () => void;
		on_close: () => void;
	};

	const { conversation_id, kind, participants, on_changed, on_close }: Props = $props();

	let adding = $state(false);
	let candidates = $state<Friend[]>([]);
	let loading_candidates = $state(false);
	let selected_ids = $state<string[]>([]);
	let working = $state(false);
	let error_message = $state<string | null>(null);
	let confirming_leave = $state(false);

	const existing_ids = $derived(participants.map((participant) => participant.id));

	async function open_add() {
		adding = true;
		loading_candidates = true;
		error_message = null;

		try {
			const response = await fetch('/api/pigeon/friends');
			if (!response.ok) {
				error_message = 'Could not load your friends.';
				return;
			}

			// Anyone already here is not a candidate.
			const friends: Friend[] = (await response.json()).friends;
			candidates = friends.filter((friend) => !existing_ids.includes(friend.id));
		} catch {
			error_message = 'Could not reach the server.';
		} finally {
			loading_candidates = false;
		}
	}

	function toggle(friend_id: string) {
		selected_ids = selected_ids.includes(friend_id)
			? selected_ids.filter((id) => id !== friend_id)
			: [...selected_ids, friend_id];
	}

	async function add_members() {
		if (selected_ids.length === 0 || working) return;

		working = true;
		error_message = null;

		try {
			const response = await fetch(`/api/pigeon/conversations/${conversation_id}/members`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ member_ids: selected_ids })
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error_message = describe_error(payload?.error);
				return;
			}

			selected_ids = [];
			adding = false;
			on_changed();
		} catch {
			error_message = 'Could not reach the server.';
		} finally {
			working = false;
		}
	}

	async function leave() {
		if (working) return;

		working = true;
		error_message = null;

		try {
			const response = await fetch(`/api/pigeon/conversations/${conversation_id}/members`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				error_message = 'Could not leave this conversation.';
				return;
			}

			await goto(resolve('/messages'), { invalidateAll: true });
		} catch {
			error_message = 'Could not reach the server.';
		} finally {
			working = false;
		}
	}

	function describe_error(code: unknown): string {
		if (code === 'not_group_owner') return 'Only whoever started the group can add people.';
		if (code === 'not_a_group') return 'This is a one-to-one conversation.';
		if (code === 'not_mutual_follow') {
			return 'You can only add people who follow you back.';
		}
		if (code === 'recipient_home_unset') return 'Someone you picked has not set a home loft yet.';
		if (code === 'group_size_out_of_range') return 'That would make the group too large.';
		return 'Could not add anyone just now.';
	}

	function describe_cost(person: Participant | Friend): string {
		if (person.flight_ms === null || person.flight_ms === undefined) return '';

		return `${format_distance(person.distance_km ?? null)} · ${format_duration(person.flight_ms)}`;
	}
</script>

<section class="members" aria-label="Conversation members">
	<header class="members-head">
		<h2>{kind === 'group' ? 'Members' : 'Conversation'}</h2>
		<button type="button" aria-label="Close members" onclick={on_close}><X size={16} /></button>
	</header>

	<ul class="members-list">
		{#each participants as participant (participant.id)}
			<li class="members-row">
				<img src={participant.avatar || '/default-avatar.svg'} alt={participant.name} />
				<span class="members-text">
					<span class="members-name">
						{participant.name}
						{#if participant.verified}
							<BadgeCheck size={13} fill="#0ea5e9" color="white" />
						{/if}
					</span>
					<span class="members-handle">@{participant.handle}</span>
				</span>
				<span class="members-cost">{describe_cost(participant)}</span>
			</li>
		{/each}
	</ul>

	{#if kind === 'group'}
		{#if adding}
			{#if loading_candidates}
				<p class="members-state"><LoaderCircle size={14} class="members-spinner" /> Loading</p>
			{:else if candidates.length === 0}
				<p class="members-state">
					Nobody left to add. You can only add people who follow you back and have a home loft.
				</p>
			{:else}
				<ul class="members-list">
					{#each candidates as candidate (candidate.id)}
						<li>
							<button
								type="button"
								class="members-candidate"
								class:members-candidate--selected={selected_ids.includes(candidate.id)}
								onclick={() => toggle(candidate.id)}
							>
								<img src={candidate.avatar || '/default-avatar.svg'} alt={candidate.name} />
								<span class="members-text">
									<span class="members-name">{candidate.name}</span>
									<span class="members-handle">@{candidate.handle}</span>
								</span>
								<span class="members-cost">{describe_cost(candidate)}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="members-actions">
				<button
					type="button"
					class="pigeon-pill"
					disabled={selected_ids.length === 0 || working}
					onclick={add_members}
				>
					{#if working}
						<LoaderCircle size={14} class="members-spinner" />
						Adding
					{:else}
						Add {selected_ids.length > 0 ? selected_ids.length : ''}
					{/if}
				</button>
				<button
					type="button"
					class="pigeon-pill pigeon-pill--quiet"
					onclick={() => {
						adding = false;
						selected_ids = [];
					}}
				>
					Cancel
				</button>
			</div>
		{:else}
			<div class="members-actions">
				<button type="button" class="pigeon-pill pigeon-pill--quiet" onclick={open_add}>
					<UserPlus size={14} />
					Add someone
				</button>
			</div>
		{/if}
	{/if}

	<div class="members-leave">
		{#if confirming_leave}
			<p class="members-warning">
				Leaving stops new pigeons reaching you here. Messages already delivered stay in your
				history.
			</p>
			<div class="members-actions">
				<button type="button" class="members-leave-confirm" disabled={working} onclick={leave}>
					{#if working}
						<LoaderCircle size={14} class="members-spinner" />
						Leaving
					{:else}
						Yes, leave
					{/if}
				</button>
				<button
					type="button"
					class="pigeon-pill pigeon-pill--quiet"
					onclick={() => {
						confirming_leave = false;
					}}
				>
					Stay
				</button>
			</div>
		{:else}
			<button
				type="button"
				class="members-leave-start"
				onclick={() => {
					confirming_leave = true;
				}}
			>
				<LogOut size={14} />
				Leave this conversation
			</button>
		{/if}
	</div>

	{#if error_message}
		<p class="members-error" role="alert">{error_message}</p>
	{/if}
</section>

<style>
	.members {
		border-bottom: 1px solid #e2e8f0;
		background: #f8fbff;
		padding: 0.85rem 1rem;
		max-height: 45vh;
		overflow-y: auto;
	}

	.members-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.6rem;
	}

	.members-head h2 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		color: #0f172a;
	}

	.members-head button {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: 999px;
		background: #e2e8f0;
		color: #475569;
		cursor: pointer;
	}

	.members-list {
		list-style: none;
		margin: 0 0 0.6rem;
		padding: 0;
	}

	.members-row,
	.members-candidate {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.4rem 0.35rem;
		text-align: left;
	}

	.members-candidate {
		border: 1px solid transparent;
		border-radius: 10px;
		background: transparent;
		cursor: pointer;
	}

	.members-candidate:hover {
		background: #f1f5f9;
	}

	.members-candidate--selected {
		border-color: #0ea5e9;
		background: #e0f2fe;
	}

	.members-row img,
	.members-candidate img {
		width: 32px;
		height: 32px;
		border-radius: 999px;
		object-fit: cover;
	}

	.members-text {
		flex: 1;
		min-width: 0;
	}

	.members-name {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #0f172a;
	}

	.members-handle {
		font-size: 0.75rem;
		color: #64748b;
	}

	.members-cost {
		flex-shrink: 0;
		font-size: 0.7rem;
		font-weight: 600;
		color: #0284c7;
	}

	.members-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.members-state {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0 0 0.6rem;
		font-size: 0.8rem;
		line-height: 1.5;
		color: #64748b;
	}

	.members-leave {
		margin-top: 0.75rem;
		padding-top: 0.7rem;
		border-top: 1px solid #e2e8f0;
	}

	.members-leave-start {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.4rem 0.75rem;
		border: 1px solid #fecaca;
		border-radius: 999px;
		background: transparent;
		font-size: 0.78rem;
		font-weight: 600;
		color: #b91c1c;
		cursor: pointer;
	}

	.members-leave-confirm {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.45rem 0.9rem;
		border: none;
		border-radius: 999px;
		background: #b91c1c;
		font-size: 0.8rem;
		font-weight: 600;
		color: #ffffff;
		cursor: pointer;
	}

	.members-warning {
		margin: 0 0 0.5rem;
		font-size: 0.78rem;
		line-height: 1.5;
		color: #92400e;
	}

	.members-error {
		margin: 0.6rem 0 0;
		font-size: 0.78rem;
		color: #b91c1c;
	}

	:global(.members-spinner) {
		animation: members-spin 1s linear infinite;
	}

	@keyframes members-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
