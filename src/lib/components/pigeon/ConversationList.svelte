<script lang="ts">
	import { BadgeCheck } from 'lucide-svelte';
	import { epoch_from_sql } from '$lib/pigeon/clock';

	type Participant = {
		id: string;
		name: string;
		handle: string;
		avatar: string;
		verified: boolean;
	};

	type Conversation = {
		id: string;
		kind: string;
		title: string | null;
		last_activity_at: string | null;
		last_body: string | null;
		last_sender_id: string | null;
		unread_count: number;
		participants: Participant[];
	};

	type Props = {
		conversations: Conversation[];
		active_id?: string | null;
		on_select?: (conversation_id: string) => void;
	};

	const { conversations, active_id = null, on_select }: Props = $props();

	function title_for(conversation: Conversation): string {
		if (conversation.title) return conversation.title;
		if (conversation.participants.length === 0) return 'Empty conversation';
		if (conversation.participants.length === 1) return conversation.participants[0].name;

		return conversation.participants.map((participant) => participant.name).join(', ');
	}

	function is_verified(conversation: Conversation): boolean {
		return conversation.kind === 'direct' && (conversation.participants[0]?.verified ?? false);
	}

	function stamp_for(conversation: Conversation): string {
		const activity_ms = epoch_from_sql(conversation.last_activity_at);
		if (activity_ms === null) return '';

		return new Date(activity_ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

{#if conversations.length === 0}
	<p class="conversation-empty">No pigeons yet. Send one to a friend who follows you back.</p>
{:else}
	<ul class="conversation-list">
		{#each conversations as conversation (conversation.id)}
			<li>
				<button
					type="button"
					class="conversation-item"
					class:conversation-item--active={conversation.id === active_id}
					onclick={() => on_select?.(conversation.id)}
				>
					<img
						class="conversation-avatar"
						src={conversation.participants[0]?.avatar || '/default-avatar.svg'}
						alt={title_for(conversation)}
					/>

					<span class="conversation-text">
						<span class="conversation-title-row">
							<span class="conversation-title">{title_for(conversation)}</span>
							{#if is_verified(conversation)}
								<BadgeCheck size={14} fill="#0ea5e9" color="white" />
							{/if}
							{#if conversation.kind === 'group'}
								<span class="conversation-tag">
									{conversation.participants.length + 1}
								</span>
							{/if}
						</span>
						<span class="conversation-preview">
							{conversation.last_body || 'No messages have landed yet'}
						</span>
					</span>

					<span class="conversation-side">
						<span class="conversation-stamp">{stamp_for(conversation)}</span>
						{#if conversation.unread_count > 0}
							<span class="pigeon-badge">{conversation.unread_count}</span>
						{/if}
					</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.conversation-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.conversation-item {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		padding: 0.75rem 1rem;
		border: none;
		border-bottom: 1px solid #f1f5f9;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.conversation-item:hover {
		background: #f1f5f9;
	}

	.conversation-item--active {
		background: #e0f2fe;
	}

	.conversation-avatar {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.conversation-text {
		flex: 1;
		min-width: 0;
	}

	.conversation-title-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.conversation-title {
		font-size: 0.92rem;
		font-weight: 600;
		color: #0f172a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.conversation-tag {
		padding: 0 0.35rem;
		border-radius: 999px;
		background: #e2e8f0;
		font-size: 0.7rem;
		font-weight: 600;
		color: #475569;
	}

	.conversation-preview {
		display: block;
		margin-top: 0.15rem;
		font-size: 0.82rem;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.conversation-side {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
		flex-shrink: 0;
	}

	.conversation-stamp {
		font-size: 0.72rem;
		color: #94a3b8;
	}

	.conversation-empty {
		margin: 0;
		padding: 1.5rem 1rem;
		font-size: 0.85rem;
		line-height: 1.55;
		color: #64748b;
	}
</style>
