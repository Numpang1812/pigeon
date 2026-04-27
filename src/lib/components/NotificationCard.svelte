<script lang="ts">
	import { Heart, Repeat2, UserPlus, Bell, ThumbsDown, BadgeCheck } from 'lucide-svelte';

	interface Props {
		id: string;
		type: 'like' | 'dislike' | 'repost' | 'follow';
		actor_name: string;
		actor_handle?: string;
		avatar_url: string;
		actor_verified?: boolean;
		is_following_actor?: boolean;
		message: string;
		time_ago: string;
		unread: boolean;
		post_id?: string | null;
		on_height_change: (id: string, height: number) => void;
		on_view_profile: (notification_id: string, actor_handle?: string) => void;
		on_view_post: (notification_id: string, post_id?: string | null) => void;
		on_mark_as_read: (notification_id: string) => void;
		on_follow_back: (notification_id: string, actor_handle?: string) => void;
		following_back: boolean;
	}

	const {
		id,
		type,
		actor_name,
		actor_handle,
		avatar_url,
		actor_verified,
		is_following_actor,
		message,
		time_ago,
		unread,
		post_id,
		on_height_change,
		on_view_profile,
		on_view_post,
		on_mark_as_read,
		on_follow_back,
		following_back
	}: Props = $props();

	let element = $state<HTMLElement>();

	$effect(() => {
		if (!element) return;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
				if (height > 0) {
					on_height_change(id, height);
				}
			}
		});

		observer.observe(element);
		return () => observer.disconnect();
	});

	function should_show_view_post_action(): boolean {
		return (type === 'like' || type === 'dislike' || type === 'repost') && !!post_id;
	}

	function should_show_follow_actions(): boolean {
		return type === 'follow';
	}

	function should_show_follow_back(): boolean {
		return type === 'follow' && !is_following_actor;
	}

	function action_label(): string {
		switch (type) {
			case 'like':
			case 'dislike':
			case 'repost':
				return 'View post';
			case 'follow':
				return 'Follow back';
			default:
				return 'View';
		}
	}
</script>

<article
	bind:this={element}
	class="notification-card"
	class:unread
	data-notification-id={id}
>
	<div class="icon-spot" aria-hidden="true">
		{#if type === 'like'}
			<Heart size={14} />
		{:else if type === 'dislike'}
			<ThumbsDown size={14} />
		{:else if type === 'repost'}
			<Repeat2 size={14} />
		{:else if type === 'follow'}
			<UserPlus size={14} />
		{:else}
			<Bell size={14} />
		{/if}
	</div>

	<button
		type="button"
		class="avatar-btn"
		onclick={() => on_view_profile(id, actor_handle)}
		aria-label={`View ${actor_name} profile`}
	>
		<img class="avatar" src={avatar_url} alt={actor_name} loading="lazy" />
	</button>

	<div class="content-block">
		<p class="message-line">
			<button
				type="button"
				class="name-link"
				onclick={() => on_view_profile(id, actor_handle)}
			>
				<strong>{actor_name}</strong>
				{#if actor_verified}
					<span class="verified-icon" aria-label="Verified account" title="Verified account">
						<BadgeCheck size={14} aria-hidden="true" fill="#0ea5e9" color="white" />
					</span>
				{/if}
			</button>
			{#if actor_handle}
				<button
					type="button"
					class="handle-link"
					onclick={() => on_view_profile(id, actor_handle)}
				>
					<span class="handle">@{actor_handle}</span>
				</button>
			{/if}
			<span>{message}</span>
		</p>
		<div class="meta-row">
			<span class="time">{time_ago}</span>
			{#if unread}
				<button
					type="button"
					class="inline-action"
					onclick={() => on_mark_as_read(id)}
				>
					Mark as read
				</button>
			{/if}
			{#if should_show_view_post_action()}
				<button type="button" class="inline-action" onclick={() => on_view_post(id, post_id)}>
					{action_label()}
				</button>
			{/if}
			{#if should_show_follow_actions()}
				<button
					type="button"
					class="inline-action"
					onclick={() => on_view_profile(id, actor_handle)}
				>
					View profile
				</button>
				{#if should_show_follow_back()}
					<button
						type="button"
						class="inline-action"
						disabled={following_back}
						onclick={() => on_follow_back(id, actor_handle)}
					>
						{following_back ? 'Following...' : 'Follow back'}
					</button>
				{/if}
			{/if}
		</div>
	</div>
</article>

<style>
	.notification-card {
		display: grid;
		grid-template-columns: auto auto 1fr;
		gap: 0.8rem;
		align-items: start;
		padding: 0.85rem 0.9rem;
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 0.9rem;
		box-shadow: 0 2px 10px rgba(15, 23, 42, 0.035);
		contain: layout;
	}

	.notification-card.unread {
		background: #eff6ff;
		border-color: #bfdbfe;
	}

	.icon-spot {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.65rem;
		height: 1.65rem;
		border-radius: 999px;
		background: #e0f2fe;
		color: #0369a1;
		margin-top: 0.2rem;
	}

	.avatar {
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 999px;
		object-fit: cover;
		border: 1px solid #dbe7f5;
	}

	.avatar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: 999px;
		transition: opacity 0.15s ease;
	}

	.avatar-btn:hover {
		opacity: 0.8;
	}

	.avatar-btn img {
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 999px;
		object-fit: cover;
		border: 1px solid #dbe7f5;
	}

	.content-block {
		min-width: 0;
	}

	.message-line {
		margin: 0;
		font-size: 0.93rem;
		line-height: 1.48;
		color: #334155;
	}

	.message-line strong {
		font-weight: 800;
		color: #0f172a;
	}

	.name-link,
	.handle-link {
		padding: 0;
		border: none;
		background: none;
		font-size: inherit;
		font-weight: inherit;
		font-family: inherit;
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.name-link {
		color: inherit;
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.verified-icon {
		display: inline-flex;
		align-items: center;
		color: #ffffff;
		flex-shrink: 0;
	}

	.name-link:hover strong {
		color: #0284c7;
	}

	.handle-link {
		color: inherit;
	}

	.handle-link:hover .handle {
		color: #0284c7;
	}

	.handle {
		margin-left: 0.35rem;
		margin-right: 0.35rem;
		font-size: 0.82rem;
		font-weight: 700;
		color: #64748b;
	}

	.meta-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.45rem;
	}

	.time {
		font-size: 0.77rem;
		font-weight: 700;
		color: #64748b;
	}

	.inline-action {
		padding: 0;
		border: none;
		background: none;
		font-size: 0.78rem;
		font-weight: 700;
		color: #0284c7;
		cursor: pointer;
	}

	.inline-action:hover {
		text-decoration: underline;
	}

	@media (max-width: 900px) {
		.notification-card {
			grid-template-columns: auto 1fr;
		}

		.icon-spot {
			order: 2;
			justify-self: end;
		}

		.avatar {
			grid-row: 1 / 3;
		}
	}
</style>
