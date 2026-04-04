<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { AtSign, Bell, Check, Heart, MessageCircle, UserPlus } from 'lucide-svelte';

	const session = auth_client.useSession();

	type NotificationType = 'like' | 'reply' | 'follow' | 'mention' | 'system';
	type NotificationFilter = 'all' | 'unread';

	type NotificationItem = {
		id: string;
		type: NotificationType;
		actor_name: string;
		actor_handle?: string;
		avatar_url: string;
		message: string;
		time_ago: string;
		day_group: 'Today' | 'Earlier this week' | 'Older';
		unread: boolean;
	};

	const filters = [
		{ id: 'all', label: 'All' },
		{ id: 'unread', label: 'Unread' }
	] as const;

	let active_filter = $state<NotificationFilter>('all');

	let notifications = $state<NotificationItem[]>([
		{
			id: 'n1',
			type: 'mention',
			actor_name: 'Aether Travel',
			actor_handle: 'aether.travel',
			avatar_url: 'https://i.pravatar.cc/100?u=mention-1',
			message: 'mentioned you in a post: "That shot by @you was incredible."',
			time_ago: '5m',
			day_group: 'Today',
			unread: true
		},
		{
			id: 'n2',
			type: 'reply',
			actor_name: 'Neon City',
			actor_handle: 'neoncity',
			avatar_url: 'https://i.pravatar.cc/100?u=reply-2',
			message: 'replied to your post about design systems.',
			time_ago: '38m',
			day_group: 'Today',
			unread: true
		},
		{
			id: 'n3',
			type: 'like',
			actor_name: 'Street Pulse',
			actor_handle: 'streetpulse',
			avatar_url: 'https://i.pravatar.cc/100?u=like-3',
			message: 'liked your post "Minimal APIs, maximal clarity."',
			time_ago: '1h',
			day_group: 'Today',
			unread: false
		},
		{
			id: 'n4',
			type: 'follow',
			actor_name: 'Harbor Lens',
			actor_handle: 'harborlens',
			avatar_url: 'https://i.pravatar.cc/100?u=follow-4',
			message: 'started following you.',
			time_ago: '4h',
			day_group: 'Today',
			unread: true
		},
		{
			id: 'n5',
			type: 'system',
			actor_name: 'Pigeon',
			avatar_url: 'https://i.pravatar.cc/100?u=system-5',
			message: 'Your account security check is complete. Everything looks good.',
			time_ago: '1d',
			day_group: 'Earlier this week',
			unread: false
		},
		{
			id: 'n6',
			type: 'mention',
			actor_name: 'Heatwave',
			actor_handle: 'heatwave',
			avatar_url: 'https://i.pravatar.cc/100?u=mention-6',
			message: 'mentioned you in a comment about UI motion patterns.',
			time_ago: '2d',
			day_group: 'Earlier this week',
			unread: false
		},
		{
			id: 'n7',
			type: 'reply',
			actor_name: 'Jordan Rivera',
			actor_handle: 'jordanplays',
			avatar_url: 'https://i.pravatar.cc/100?u=reply-7',
			message: 'replied: "Agree. Reusable components save weeks later."',
			time_ago: '4d',
			day_group: 'Older',
			unread: false
		}
	]);

	const unread_count = $derived(notifications.filter((n) => n.unread).length);

	const filtered_notifications = $derived(
		notifications.filter((n) => {
			if (active_filter === 'unread') return n.unread;
			return true;
		})
	);

	function grouped_notifications(items: NotificationItem[]) {
		const order = ['Today', 'Earlier this week', 'Older'] as const;
		return order
			.map((group) => ({
				group,
				items: items.filter((n) => n.day_group === group)
			}))
			.filter((section) => section.items.length > 0);
	}

	function mark_all_as_read(): void {
		notifications = notifications.map((n) => ({ ...n, unread: false }));
	}

	function mark_as_read(id: string): void {
		notifications = notifications.map((n) => (n.id === id ? { ...n, unread: false } : n));
	}

	function action_label(type: NotificationType): string {
		switch (type) {
			case 'mention':
				return 'View mention';
			case 'reply':
				return 'View reply';
			case 'like':
				return 'View post';
			case 'follow':
				return 'Follow back';
			case 'system':
				return 'Review';
			default:
				return 'View';
		}
	}
</script>

<svelte:head>
	<title>Notifications · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="notifications" aria-label="Notifications page">
		<header class="notifications-header">
			<div class="title-block">
				<h1 class="notifications-title">Notifications</h1>
			</div>

			<div class="header-actions">
				<button
					type="button"
					class="action-btn"
					onclick={mark_all_as_read}
					disabled={unread_count === 0}
				>
					<Check size={16} /> Mark all as read
				</button>
			</div>
		</header>

		<div class="filter-row" role="tablist" aria-label="Notification filters">
			{#each filters as filter (filter.id)}
				<button
					type="button"
					role="tab"
					aria-selected={active_filter === filter.id}
					class="filter-chip"
					class:active={active_filter === filter.id}
					onclick={() => (active_filter = filter.id)}
				>
					{filter.label}
					{#if filter.id === 'unread' && unread_count > 0}
						<span class="badge">{unread_count}</span>
					{/if}
				</button>
			{/each}
		</div>

		<section class="feed-column" aria-label="Notification timeline">
			{#if filtered_notifications.length > 0}
				{#each grouped_notifications(filtered_notifications) as section (section.group)}
					<div class="group-block">
						<h2 class="group-title">{section.group}</h2>
						<div class="notification-list">
							{#each section.items as item (item.id)}
								<article class="notification-card" class:unread={item.unread}>
									<div class="icon-spot" aria-hidden="true">
										{#if item.type === 'mention'}
											<AtSign size={14} />
										{:else if item.type === 'reply'}
											<MessageCircle size={14} />
										{:else if item.type === 'like'}
											<Heart size={14} />
										{:else if item.type === 'follow'}
											<UserPlus size={14} />
										{:else}
											<Bell size={14} />
										{/if}
									</div>

									<img class="avatar" src={item.avatar_url} alt={item.actor_name} loading="lazy" />

									<div class="content-block">
										<p class="message-line">
											<strong>{item.actor_name}</strong>
											{#if item.actor_handle}
												<span class="handle">@{item.actor_handle}</span>
											{/if}
											<span>{item.message}</span>
										</p>
										<div class="meta-row">
											<span class="time">{item.time_ago}</span>
											{#if item.unread}
												<button
													type="button"
													class="inline-action"
													onclick={() => mark_as_read(item.id)}
												>
													Mark as read
												</button>
											{/if}
											<button type="button" class="inline-action">{action_label(item.type)}</button>
										</div>
									</div>
								</article>
							{/each}
						</div>
					</div>
				{/each}
			{:else}
				<div class="empty-state" aria-label="No notifications">
					<p>No notifications in this view right now.</p>
				</div>
			{/if}
		</section>
	</div>
{:else if !$session.isPending}
	<main class="login-prompt">
		<h2>Unauthenticated</h2>
		<p>You need to log in to view this page.</p>
		<a href={resolve('/')} class="login-link">Go to Login</a>
	</main>
{:else}
	<main class="loading">
		<p>Loading...</p>
	</main>
{/if}

<style>
	.notifications {
		min-height: calc(100vh - var(--navbar-height));
		padding: 1.5rem 0 3rem;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 38%, #ffffff 100%);
		color: #0f172a;
	}

	.notifications-header {
		max-width: 980px;
		margin: 0 auto 1.1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.notifications-title {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		margin: 0;
		font-size: clamp(1.65rem, 3vw, 2rem);
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.header-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border: none;
		border-radius: 999px;
		padding: 0.55rem 0.85rem;
		font-size: 0.82rem;
		font-weight: 700;
		color: #fff;
		background: linear-gradient(135deg, #0ea5e9 0%, #1da1f2 100%);
		cursor: pointer;
		text-decoration: none;
		transition: filter 0.18s ease;
	}

	.action-btn:hover {
		filter: brightness(0.95);
	}

	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		max-width: 980px;
		margin: 0 auto 1rem;
	}

	.filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		border: 1px solid #e2e8f0;
		background: #fff;
		color: #475569;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.18s ease,
			border-color 0.18s ease,
			color 0.18s ease,
			box-shadow 0.18s ease;
	}

	.filter-chip:hover {
		border-color: #cbd5e1;
		background: #f8fafc;
	}

	.filter-chip.active {
		background: linear-gradient(135deg, #0ea5e9 0%, #1da1f2 100%);
		border-color: transparent;
		color: #fff;
		box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.2rem;
		height: 1.2rem;
		padding: 0 0.3rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 800;
		background: rgba(15, 23, 42, 0.12);
	}

	.feed-column {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		box-sizing: border-box;
	}

	.group-block {
		margin-bottom: 1.1rem;
	}

	.group-title {
		margin: 0 0 0.55rem;
		font-size: 0.9rem;
		font-weight: 800;
		color: #334155;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.notification-list {
		display: grid;
		gap: 0.5rem;
	}

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

	.empty-state {
		padding: 1rem 1.1rem;
		border: 1px solid #e2e8f0;
		border-radius: 0.75rem;
		background: #fff;
	}

	.empty-state p {
		margin: 0;
		color: #64748b;
	}

	.login-prompt {
		min-height: calc(100vh - var(--navbar-height));
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		gap: 1rem;
	}

	.login-link {
		color: #1da1f2;
		font-weight: 700;
		text-decoration: none;
	}

	.login-link:hover {
		text-decoration: underline;
	}

	.loading {
		min-height: calc(100vh - var(--navbar-height));
		display: flex;
		align-items: center;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	@media (max-width: 900px) {
		.notifications {
			padding-bottom: 2rem;
		}

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

	@media (max-width: 640px) {
		.notifications-header {
			gap: 0.8rem;
		}

		.header-actions {
			width: 100%;
		}

		.action-btn {
			flex: 1 1 auto;
			justify-content: center;
		}

		.filter-row {
			margin-bottom: 0.8rem;
		}

		.message-line {
			font-size: 0.9rem;
		}
	}
</style>
