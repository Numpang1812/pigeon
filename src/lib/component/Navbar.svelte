<script lang="ts">
	import { Bell, Search } from 'lucide-svelte';
	import './styles/navbar.css';

	const { on_notification_click }: { on_notification_click?: () => void } = $props();

	type NotificationPreview = {
		id: number;
		user: string;
		action: string;
		time: string;
		read: boolean;
	};

	let search = $state('');
	let panel_open = $state(false);

	let notifications = $state<NotificationPreview[]>([
		{ id: 1, user: 'John Doe', action: 'liked your post', time: '2h ago', read: false },
		{ id: 2, user: 'Anna', action: 'commented on your photo', time: '3h ago', read: false },
		{ id: 3, user: 'Mike', action: 'started following you', time: '5h ago', read: true },
		{ id: 4, user: 'Sophia', action: 'liked your comment', time: '1d ago', read: true }
	]);

	function handle_search(e: Event): void {
		search = (e.currentTarget as HTMLInputElement).value;
	}

	function handle_notification_click(): void {
		if (on_notification_click) {
			on_notification_click();
			return;
		}

		panel_open = !panel_open;
	}

	function close_panel(): void {
		panel_open = false;
	}

	function mark_as_read(id: number): void {
		notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
	}
</script>

<header class="navbar">
	<div class="right">
		<div class="search-box">
			<span class="icon search-icon"><Search /></span>
			<input
				type="text"
				placeholder="Search Pigeon..."
				bind:value={search}
				oninput={handle_search}
			/>
		</div>

		<button
			class="icon-btn"
			type="button"
			aria-label="Notifications"
			aria-expanded={panel_open}
			aria-controls="navbar-notification-drawer"
			onclick={handle_notification_click}
		>
			<span class="notify-icon"><Bell /></span>
		</button>

		<div class="avatar">
			<img src="https://i.pravatar.cc/40" alt="user" />
		</div>
	</div>
</header>

<button
	type="button"
	class="notif-overlay {panel_open ? 'show' : ''}"
	onclick={close_panel}
	aria-label="Close notifications"
></button>

<aside id="navbar-notification-drawer" class="notif-drawer {panel_open ? 'open' : ''}">
	<div class="notif-header">
		<h3>Notifications</h3>
		<button type="button" class="notif-close" onclick={close_panel} aria-label="Close panel"
			>×</button
		>
	</div>

	<div class="notif-list">
		{#each notifications as item (item.id)}
			<button
				type="button"
				class="notif-item {item.read ? '' : 'unread'}"
				onclick={() => mark_as_read(item.id)}
			>
				<p><strong>{item.user}</strong> {item.action}</p>
				<span>{item.time}</span>
			</button>
		{/each}
	</div>
</aside>
