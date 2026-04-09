<script lang="ts">
	import { goto } from '$app/navigation';
	import { Bell, Menu, Search } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { normalize_handle } from '$lib';
	import './styles/navbar.css';

	const session = auth_client.useSession();

	let search = $state('');
	let results = $state<{ id: string; name: string; username: string; image: string | null }[]>([]);
	let is_loading = $state(false);
	let show_dropdown = $state(false);
	let timer: ReturnType<typeof setTimeout>;
	let unseen_notifications_count = $state(0);
	let on_notifications_page = $state(false);
	let is_sidebar_collapsed = $state(false);

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
			unseen_notifications_count = notifications.filter(
				(item) => !item.id || !read_ids.has(item.id)
			).length;
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

	function handle_search_focusout(event: FocusEvent): void {
		const next_target = event.relatedTarget;
		if (next_target instanceof Node && event.currentTarget instanceof HTMLElement) {
			if (event.currentTarget.contains(next_target)) return;
		}

		show_dropdown = false;
	}

	function open_notifications(): void {
		on_notifications_page = true;
		goto(resolve('/notifications'));
	}

	function toggle_sidebar_from_navbar(): void {
		if (typeof window === 'undefined') return;
		window.dispatchEvent(new Event('sidebar-toggle-requested'));
	}

	$effect(() => {
		refresh_notification_dot();
		const interval = setInterval(refresh_notification_dot, 8000);

		const handle_sidebar_state_change = (event: Event): void => {
			const detail =
				event instanceof CustomEvent ? (event.detail as { is_collapsed?: boolean }) : undefined;
			is_sidebar_collapsed = Boolean(detail?.is_collapsed);
		};

		window.addEventListener('focus', refresh_notification_dot);
		window.addEventListener('visibilitychange', refresh_notification_dot);
		window.addEventListener('notifications-seen-updated', refresh_notification_dot);
		window.addEventListener('sidebar-state-changed', handle_sidebar_state_change as EventListener);

		return () => {
			clearInterval(interval);
			window.removeEventListener('focus', refresh_notification_dot);
			window.removeEventListener('visibilitychange', refresh_notification_dot);
			window.removeEventListener('notifications-seen-updated', refresh_notification_dot);
			window.removeEventListener(
				'sidebar-state-changed',
				handle_sidebar_state_change as EventListener
			);
		};
	});

	const notification_badge_text = $derived(
		unseen_notifications_count > 99 ? '99+' : `${unseen_notifications_count}`
	);
</script>

<header class="navbar">
	<div class="left">
		{#if !is_sidebar_collapsed}
			<button
				class="mobile-menu-btn"
				type="button"
				aria-label="Toggle sidebar"
				onclick={toggle_sidebar_from_navbar}
			>
				<Menu size={20} />
			</button>
		{/if}
	</div>
	<div class="right">
		<div class="search-container" onfocusout={handle_search_focusout}>
			<div class="search-box">
				<span class="icon search-icon"><Search /></span>
				<input
					type="text"
					placeholder="Search Pigeon..."
					bind:value={search}
					oninput={handle_search}
					onfocus={() => {
						if (search) show_dropdown = true;
					}}
				/>
			</div>

			{#if show_dropdown}
				<div class="search-dropdown">
					{#if is_loading}
						<div class="search-item loading">Searching...</div>
					{:else if results.length > 0}
						{#each results as user (user.id)}
							<button
								type="button"
								class="search-item"
								onclick={async () => {
									const normalized = normalize_handle(user.username);
									if (normalized) {
										show_dropdown = false;
										await goto(resolve('/profile/[handle]', { handle: normalized }));
									}
								}}
							>
								<img
									src={user.image || 'https://i.pravatar.cc/40'}
									alt={user.name}
									class="search-avatar"
								/>
								<div class="search-info">
									<p class="search-name">{user.name}</p>
									<p class="search-email">@{user.username}</p>
								</div>
							</button>
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
				<span
					class="notify-count"
					aria-label={`${unseen_notifications_count} unread notifications`}
				>
					{notification_badge_text}
				</span>
			{/if}
		</button>

		<a class="avatar" href={resolve('/profile')} aria-label="View profile">
			<img src={$session.data?.user?.image || 'https://i.pravatar.cc/40'} alt="user" />
		</a>
	</div>
</header>
