<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { normalize_handle } from '$lib';
	import { SvelteSet } from 'svelte/reactivity';
	import { onMount } from 'svelte';
	import {
		Check,
		Loader
	} from 'lucide-svelte';
	import UnauthenticatedPrompt from '$lib/components/UnauthenticatedPrompt.svelte';
	import NotificationCard from '$lib/components/NotificationCard.svelte';

	const session = auth_client.useSession();

	type NotificationType = 'like' | 'dislike' | 'repost' | 'follow';
	type NotificationFilter = 'all' | 'unread';

	type NotificationItem = {
		id: string;
		type: NotificationType;
		actor_name: string;
		actor_handle?: string;
		avatar_url: string;
		is_following_actor?: boolean;
		message: string;
		time_ago: string;
		day_group: 'Today' | 'Earlier this week' | 'Older';
		unread: boolean;
		post_id?: string | null;
		actor_verified?: boolean;
	};

	type GroupedNotification = {
		group: 'Today' | 'Earlier this week' | 'Older';
		items: NotificationItem[];
	};

	const filters = [
		{ id: 'all', label: 'All' },
		{ id: 'unread', label: 'Unread' }
	] as const;

	const read_notifications_key = 'pigeon_notifications_read_ids';
	const page_size = 15;
	const estimated_height = 140;
	const buffer_count = 8;

	// --- Main State ---
	let initial_load_triggered = false;
	let active_filter = $state<NotificationFilter>('all');
	let notifications = $state<NotificationItem[]>([]);
	let loading_initial = $state(true);
	let fetching_more = $state(false);
	let has_more = $state(true);
	let offset = $state(0);
	const following_back = new SvelteSet<string>();

	// --- Virtualization State ---
	let scroll_top = $state(0);
	let viewport_height = $state(1000);
	const height_cache = $state<Record<string, number>>({});
	let sentinel_el = $state<HTMLElement>();
	let feed_container = $state<HTMLElement>();

	// --- Derived State ---
	const unread_count = $derived(notifications.filter((n) => n.unread).length);

	const filtered_notifications = $derived(
		notifications.filter((n) => {
			if (active_filter === 'unread') return n.unread;
			return true;
		})
	);

	function grouped_notifications_array(items: NotificationItem[]): GroupedNotification[] {
		const order = ['Today', 'Earlier this week', 'Older'] as const;
		return order
			.map((group) => ({
				group,
				items: items.filter((n) => n.day_group === group)
			}))
			.filter((section) => section.items.length > 0);
	}

	const virtual_grouped_notifications = $derived.by(() => {
		const grouped = grouped_notifications_array(filtered_notifications);
		let current_y = 0;
		let start_index = -1;
		let end_index = -1;
		const flat_items: Array<{ item: NotificationItem; group: GroupedNotification }> = [];

		// Flatten with group references
		for (const group of grouped) {
			for (const item of group.items) {
				flat_items.push({ item, group });
			}
		}

		// Find visible range
		for (let i = 0; i < flat_items.length; i++) {
			const h = height_cache[flat_items[i].item.id] ?? estimated_height;
			if (start_index === -1 && current_y + h > scroll_top) {
				start_index = Math.max(0, i - buffer_count);
			}
			if (start_index !== -1 && current_y > scroll_top + viewport_height) {
				end_index = Math.min(flat_items.length - 1, i + buffer_count);
				break;
			}
			current_y += h;
		}

		if (start_index === -1) start_index = 0;
		if (end_index === -1) end_index = flat_items.length - 1;

		// Calculate spacers
		let top_spacer = 0;
		for (let i = 0; i < start_index; i++) {
			top_spacer += height_cache[flat_items[i].item.id] ?? estimated_height;
		}

		let bottom_spacer = 0;
		for (let i = end_index + 1; i < flat_items.length; i++) {
			bottom_spacer += height_cache[flat_items[i].item.id] ?? estimated_height;
		}

		// Rebuild grouped structure for visible items
		const visible_flat = flat_items.slice(start_index, end_index + 1);
		const result_groups: GroupedNotification[] = [];
		let current_group: GroupedNotification | null = null;

		for (const { item, group } of visible_flat) {
			if (!current_group || current_group.group !== group.group) {
				current_group = { group: group.group, items: [] };
				result_groups.push(current_group);
			}
			current_group.items.push(item);
		}

		return { groups: result_groups, top_spacer, bottom_spacer };
	});

	// --- Height Tracking ---
	function handle_height_change(id: string, height: number) {
		if (height_cache[id] !== height) {
			height_cache[id] = height;
		}
	}

	// --- Scroll & Resize Handlers ---
	function handle_scroll(e?: Event) {
		let st = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
		if (e?.target && (e.target as HTMLElement).scrollTop !== undefined) {
			st = Math.max(st, (e.target as HTMLElement).scrollTop);
		}
		scroll_top = st;
	}

	function handle_resize() {
		viewport_height = Math.max(window.innerHeight || 0, 0);
	}

	// --- Read Status Management ---
	function mark_all_as_read(): void {
		persist_read_notification_ids(notifications.map((n) => n.id));
		notifications = notifications.map((n) => ({ ...n, unread: false }));
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('notifications-seen-updated'));
		}
	}

	function mark_as_read(id: string): void {
		persist_read_notification_ids([id]);
		notifications = notifications.map((n) => (n.id === id ? { ...n, unread: false } : n));
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new Event('notifications-seen-updated'));
		}
	}

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

	function persist_read_notification_ids(ids: string[]): void {
		if (typeof window === 'undefined' || ids.length === 0) return;
		const current = get_read_notification_ids();
		for (const id of ids) current.add(id);
		localStorage.setItem(read_notifications_key, JSON.stringify(Array.from(current)));
	}

	// --- Data Loading ---
	async function load_initial_notifications(): Promise<void> {
		if (typeof window === 'undefined') return;
		loading_initial = true;
		offset = 0;
		has_more = true;
		notifications = [];

		try {
			const response = await fetch(resolve(`/api/notifications?limit=${page_size}&offset=0`));
			if (!response.ok) {
				notifications = [];
				loading_initial = false;
				return;
			}

			const result = await response.json();
			const incoming: NotificationItem[] = Array.isArray(result.notifications)
				? (result.notifications as NotificationItem[])
				: [];
			const read_ids = get_read_notification_ids();
			notifications = incoming.map((item) => ({
				...item,
				unread: !read_ids.has(item.id)
			}));

			has_more = incoming.length === page_size;
			offset = incoming.length;
		} catch (error) {
			console.error('Failed to load notifications:', error);
			notifications = [];
		} finally {
			loading_initial = false;
		}
	}

	async function load_more_notifications(): Promise<void> {
		if (!has_more || fetching_more) return;
		if (typeof window === 'undefined') return;
		fetching_more = true;

		try {
			const response = await fetch(resolve(`/api/notifications?limit=${page_size}&offset=${offset}`));
			if (!response.ok) {
				fetching_more = false;
				return;
			}

			const result = await response.json();
			const incoming: NotificationItem[] = Array.isArray(result.notifications)
				? (result.notifications as NotificationItem[])
				: [];
			const read_ids = get_read_notification_ids();
			const new_notifications = incoming.map((item) => ({
				...item,
				unread: !read_ids.has(item.id)
			}));

			// Deduplicate
			const existing_ids = new Set(notifications.map((n) => n.id));
			const unique_new_notifications = new_notifications.filter((n) => !existing_ids.has(n.id));
			notifications = [...notifications, ...unique_new_notifications];

			has_more = incoming.length === page_size;
			offset += incoming.length;
		} catch (error) {
			console.error('Failed to load more notifications:', error);
		} finally {
			fetching_more = false;
		}
	}

	// --- Intersection Observer for Infinite Scroll ---
	$effect(() => {
		if (!sentinel_el || typeof window === 'undefined') return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && has_more && !loading_initial && !fetching_more) {
					load_more_notifications();
				}
			},
			{ rootMargin: '800px' }
		);

		observer.observe(sentinel_el);
		return () => observer.disconnect();
	});

	// --- Scroll & Resize Listeners ---
	onMount(() => {
		handle_resize();
		handle_scroll();
		// Use capture: true to catch scroll events from any internal scrollable container
		window.addEventListener('scroll', handle_scroll, { passive: true, capture: true });
		window.addEventListener('resize', handle_resize, { passive: true });

		return () => {
			window.removeEventListener('scroll', handle_scroll, { capture: true });
			window.removeEventListener('resize', handle_resize);
		};
	});

	// --- Initial Load ---
	$effect(() => {
		if (typeof window === 'undefined') return;
		if ($session.data && !initial_load_triggered) {
			initial_load_triggered = true;
			load_initial_notifications();
		}
	});

	// --- User Interactions ---
	async function view_post(notification_id: string, post_id?: string | null): Promise<void> {
		if (!post_id) return;
		mark_as_read(notification_id);
		if (typeof window !== 'undefined') {
			window.location.assign(
				resolve('/home') + `?post_id=${encodeURIComponent(post_id)}#post-${post_id}`
			);
			return;
		}

		await goto(resolve('/home'));
	}

	async function view_profile(notification_id: string, actor_handle?: string): Promise<void> {
		if (!actor_handle) return;
		mark_as_read(notification_id);
		const normalized = normalize_handle(actor_handle);
		if (!normalized) return;
		await goto(resolve('/profile/[handle]', { handle: normalized }));
	}

	async function follow_back(notification_id: string, actor_handle?: string): Promise<void> {
		if (!actor_handle) return;

		following_back.add(notification_id);

		try {
			const follow_res = await fetch(`/api/users/follow/${encodeURIComponent(actor_handle)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			if (follow_res.ok) {
				const notification_index = notifications.findIndex((n) => n.id === notification_id);
				if (notification_index !== -1) {
					notifications[notification_index].is_following_actor = true;
					mark_as_read(notification_id);
				}
			} else {
				console.error('Failed to follow user:', follow_res.statusText);
			}
		} catch (error) {
			console.error('Failed to follow back:', error);
		} finally {
			following_back.delete(notification_id);
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

		<section class="feed-column" aria-label="Notification timeline" bind:this={feed_container}>
			{#if loading_initial}
				<div class="empty-state" aria-label="Loading notifications">
					<p>Loading notifications...</p>
				</div>
			{:else if filtered_notifications.length > 0}
				<div style="height: {virtual_grouped_notifications.top_spacer}px; pointer-events: none;"></div>
				{#each virtual_grouped_notifications.groups as section (section.group)}
					<div class="group-block">
						<h2 class="group-title">{section.group}</h2>
						<div class="notification-list">
							{#each section.items as item (item.id)}
								<NotificationCard
									id={item.id}
									type={item.type}
									actor_name={item.actor_name}
									actor_handle={item.actor_handle}
									avatar_url={item.avatar_url}
									actor_verified={item.actor_verified}
									is_following_actor={item.is_following_actor}
									message={item.message}
									time_ago={item.time_ago}
									unread={item.unread}
									post_id={item.post_id}
									on_height_change={handle_height_change}
									on_view_profile={view_profile}
									on_view_post={view_post}
									on_mark_as_read={mark_as_read}
									on_follow_back={follow_back}
									following_back={following_back.has(item.id)}
								/>
							{/each}
						</div>
					</div>
				{/each}
				<div style="height: {virtual_grouped_notifications.bottom_spacer}px; pointer-events: none;"></div>
				<div bind:this={sentinel_el} style="height: 1px; pointer-events: none;"></div>
				{#if fetching_more}
					<div class="loading-indicator" aria-label="Loading more notifications">
						<Loader size={16} class="spinner" />
						<span>Loading more...</span>
					</div>
				{/if}
			{:else}
				<div class="empty-state" aria-label="No notifications">
					<p>No notifications in this view right now.</p>
				</div>
			{/if}
		</section>
	</div>
{:else if !$session.isPending}
	<UnauthenticatedPrompt />
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

	.loading-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 1rem 1.1rem;
		color: #64748b;
		font-size: 0.87rem;
		font-weight: 600;
	}

	.loading-indicator .spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
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
	}
</style>
