<script lang="ts">
	import { goto } from '$app/navigation';
	import { Bell, Search } from 'lucide-svelte';
	import './styles/navbar.css';

	let search = $state('');
	let results = $state<{ id: string; name: string; username: string; image: string | null }[]>([]);
	let is_loading = $state(false);
	let show_dropdown = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	let unseen_notifications_count = $state(0);
	let on_notifications_page = $state(false);

 	const read_notifications_key = 'pigeon_notifications_read_ids';

	type NavbarNotificationItem = { id?: string };

	function get_read_notification_ids(): Set<string> {
		if (typeof window === 'undefined') return new Set<string>();
		try {
			const raw = localStorage.getItem(read_notifications_key);
			if (!raw) return new Set<string>();
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return new Set<string>();
			return new Set(parsed.filter((id): id is string => typeof id === 'string'));
		} catch {
			return new Set<string>();
		}
	}

	async function refresh_notification_dot(): Promise<void> {
		if (typeof window === 'undefined') return;
		on_notifications_page = window.location.pathname === '/notifications';

		try {
			const response = await fetch('/api/notifications?limit=100');
			if (!response.ok) return;

			const data = await response.json();
			const notifications: NavbarNotificationItem[] = Array.isArray(data?.notifications)
				? data.notifications
				: [];
			if (notifications.length === 0) {
				unseen_notifications_count = 0;
				return;
			}

			const read_ids = get_read_notification_ids();
			unseen_notifications_count = notifications.filter((item) => !item.id || !read_ids.has(item.id)).length;
		} catch (error) {
			console.error('Failed to fetch latest notification state:', error);
		}
	}

	async function fetch_users(query: string) {
		if (!query.trim()) {
			results = [];
			show_dropdown = false;
			return;
		}

		is_loading = true;
		show_dropdown = true;
		try {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
			if (res.ok) {
				const data = await res.json();
				results = data.users || [];
			}
		} catch (e) {
			console.error(e);
		} finally {
			is_loading = false;
		}
	}

	function handle_search(e: Event): void {
		search = (e.currentTarget as HTMLInputElement).value;
		clearTimeout(timer);
		timer = setTimeout(() => {
			fetch_users(search);
		}, 300);
	}

	function close_dropdown() {
		setTimeout(() => { show_dropdown = false; }, 200);
	}

	function open_notifications(): void {
		on_notifications_page = true;
		goto('/notifications');
	}

	$effect(() => {
		refresh_notification_dot();
		const interval = setInterval(refresh_notification_dot, 8000);
		window.addEventListener('focus', refresh_notification_dot);
		window.addEventListener('visibilitychange', refresh_notification_dot);
		window.addEventListener('notifications-seen-updated', refresh_notification_dot);

		return () => {
			clearInterval(interval);
			window.removeEventListener('focus', refresh_notification_dot);
			window.removeEventListener('visibilitychange', refresh_notification_dot);
			window.removeEventListener('notifications-seen-updated', refresh_notification_dot);
		};
	});

	const notification_badge_text = $derived(
		unseen_notifications_count > 99 ? '99+' : `${unseen_notifications_count}`
	);
</script>

<header class="navbar">
	<div class="right">
		<div class="search-container">
			<div class="search-box">
				<span class="icon search-icon"><Search /></span>
				<input
					type="text"
					placeholder="Search Pigeon..."
					bind:value={search}
					oninput={handle_search}
					onblur={close_dropdown}
					onfocus={() => { if(search) show_dropdown = true; }}
				/>
			</div>
			
			{#if show_dropdown}
				<div class="search-dropdown">
					{#if is_loading}
						<div class="search-item loading">Searching...</div>
					{:else if results.length > 0}
						{#each results as user (user.id)}
							<!-- svelte-ignore a11y_invalid_attribute -->
							<a href={`/profile/${user.id}`} class="search-item">
								<img src={user.image || 'https://i.pravatar.cc/40'} alt={user.name} class="search-avatar" />
								<div class="search-info">
									<p class="search-name">{user.name}</p>
									<p class="search-email">@{user.username}</p>
								</div>
							</a>
						{/each}
					{:else if search.trim().length > 0}
						<div class="search-item no-results">No users found for "{search}"</div>
					{/if}
				</div>
			{/if}
		</div>

		<button class="icon-btn" type="button" aria-label="Notifications" onclick={open_notifications}>
			<span class="notify-icon"><Bell /></span>
			{#if unseen_notifications_count > 0 && !on_notifications_page}
				<span class="notify-count" aria-label={`${unseen_notifications_count} unread notifications`}>
					{notification_badge_text}
				</span>
			{/if}
		</button>

		<div class="avatar">
			<img src="https://i.pravatar.cc/40" alt="user" />
		</div>
	</div>
</header>
