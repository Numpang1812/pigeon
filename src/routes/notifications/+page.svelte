<script lang="ts">
	import NotificationItem from './NotificationItem.svelte';
	import Navbar from '$lib/component/Navbar.svelte';
	import './notifications.css';

	type Notification = {
		id: number;
		user: string;
		action: string;
		time: string;
		avatar: string;
		read: boolean;
	};

	let active_tab = $state<'all' | 'unread'>('all');

	let notifications = $state<Notification[]>([
		{
			id: 1,
			user: 'John Doe',
			action: 'liked your post',
			time: '2h ago',
			avatar: '',
			read: false
		},
		{
			id: 2,
			user: 'Anna',
			action: 'commented on your photo',
			time: '3h ago',
			avatar: '',
			read: false
		},
		{
			id: 3,
			user: 'Mike',
			action: 'started following you',
			time: '5h ago',
			avatar: '',
			read: true
		},
		{
			id: 4,
			user: 'Sophia',
			action: 'liked your comment',
			time: '1d ago',
			avatar: '',
			read: true
		},
		{
			id: 5,
			user: 'David',
			action: 'shared your post',
			time: '2d ago',
			avatar: '',
			read: false
		}
	]);

	function mark_as_read(id: string | number): void {
		notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
	}

	function mark_all(): void {
		notifications = notifications.map((n) => ({ ...n, read: true }));
	}

	function is_today_label(time_label: string): boolean {
		const normalized = time_label.trim().toLowerCase();

		if (
			normalized.includes('just now') ||
			normalized.includes('min') ||
			normalized.includes('m ago')
		) {
			return true;
		}

		const hours_match = normalized.match(/(\d+)\s*h/);
		if (hours_match) {
			const hours = Number(hours_match[1]);
			return Number.isFinite(hours) && hours < 24;
		}

		return false;
	}

	const visible_notifications = $derived(
		active_tab === 'all' ? notifications : notifications.filter((n) => !n.read)
	);

	const new_notifications = $derived(visible_notifications.filter((n) => !n.read));
	const today_notifications = $derived(
		active_tab === 'unread'
			? []
			: visible_notifications.filter((n) => n.read && is_today_label(n.time))
	);
	const earlier_notifications = $derived(
		active_tab === 'unread'
			? []
			: visible_notifications.filter((n) => n.read && !is_today_label(n.time))
	);
</script>

<div class="page">
	<Navbar />
	<div class="container">
		<div class="header">
			<h2>Notifications</h2>
			<button type="button" onclick={mark_all}>Mark all as read</button>
		</div>

		<div class="tabs">
			<button
				type="button"
				class={active_tab === 'all' ? 'active' : ''}
				onclick={() => (active_tab = 'all')}
			>
				All
			</button>

			<button
				type="button"
				class={active_tab === 'unread' ? 'active' : ''}
				onclick={() => (active_tab = 'unread')}
			>
				Unread
			</button>
		</div>

		<div class="list">
			{#if new_notifications.length > 0}
				<section class="group">
					<h3>New</h3>
					<div class="group-list">
						{#each new_notifications as n (n.id)}
							<NotificationItem notification={n} on_click={mark_as_read} />
						{/each}
					</div>
				</section>
			{/if}

			{#if today_notifications.length > 0}
				<section class="group">
					<h3>Today</h3>
					<div class="group-list">
						{#each today_notifications as n (n.id)}
							<NotificationItem notification={n} on_click={mark_as_read} />
						{/each}
					</div>
				</section>
			{/if}

			{#if earlier_notifications.length > 0}
				<section class="group">
					<h3>Earlier</h3>
					<div class="group-list">
						{#each earlier_notifications as n (n.id)}
							<NotificationItem notification={n} on_click={mark_as_read} />
						{/each}
					</div>
				</section>
			{/if}

			{#if new_notifications.length === 0 && today_notifications.length === 0 && earlier_notifications.length === 0}
				<p class="empty">No notifications in this tab.</p>
			{/if}
		</div>
	</div>
</div>
