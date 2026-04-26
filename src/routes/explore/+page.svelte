<script lang="ts">
	import { auth_client } from '$lib/auth-client';
	import { Flame, Hash, Sparkles, ChevronLeft, ChevronRight } from 'lucide-svelte';
	import type { Component } from 'svelte';
	import VirtualizedPost from '$lib/components/VirtualizedPost.svelte';
	import UnauthenticatedPrompt from '$lib/components/UnauthenticatedPrompt.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { untrack, onMount } from 'svelte';

	const session = auth_client.useSession();

	const static_filters = [
		{ id: 'foryou', label: 'For you', icon: Sparkles },
		{ id: 'trending', label: 'Trending', icon: Flame }
	] as const;

	interface Tag {
		id: string;
		label: string;
		icon: Component;
	}

	interface PostData {
		id: string;
		post_tag: string;
		post_tags?: string[];
		posted_at: string;
		content: string;
		audience?: string;
		author_name: string;
		author_handle: string;
		author_bio?: string;
		avatar_url?: string;
		verified?: boolean;
		metrics?: {
			likes?: number;
			dislikes?: number;
			reposts?: number;
		};
		user_liked?: boolean;
		user_disliked?: boolean;
		user_reposted?: boolean;
		is_author?: boolean;
		is_edited?: boolean;
	}

	let dynamic_tags: Tag[] = $state([]);
	let active_filter = $state<string>('foryou');

	// --- State ---
	let feed_posts: PostData[] = $state([]);
	let loading = $state(true);
	let tags_loading = $state(true);
	let fetching_more = $state(false);
	let has_more = $state(true);
	let offset = $state(0);
	const page_size = 50;

	// --- Virtualization State ---
	const height_cache = $state<Record<string, number>>({});
	let scroll_top = $state(0);
	let viewport_height = $state(1500);
	let sentinel_el = $state<HTMLElement>();

	const buffer_count = 15;
	const estimated_height = 260;

	const all_filters = $derived([...static_filters, ...dynamic_tags]);
	let pills_container = $state<HTMLDivElement | null>(null);

	// --- Derived Visible Posts ---
	const virtual_feed = $derived.by(() => {
		let current_y = 0;
		let start_index = -1;
		let end_index = feed_posts.length - 1;
		
		for (let i = 0; i < feed_posts.length; i++) {
			const h = height_cache[feed_posts[i].id] ?? estimated_height;
			if (start_index === -1 && current_y + h > scroll_top) {
				start_index = Math.max(0, i - buffer_count);
			}
			if (start_index !== -1 && current_y > scroll_top + viewport_height) {
				end_index = Math.min(feed_posts.length - 1, i + buffer_count);
				break;
			}
			current_y += h;
		}

		if (start_index === -1) start_index = 0;

		let top_spacer = 0;
		for (let i = 0; i < start_index; i++) {
			top_spacer += height_cache[feed_posts[i].id] ?? estimated_height;
		}

		let bottom_spacer = 0;
		for (let i = end_index + 1; i < feed_posts.length; i++) {
			bottom_spacer += height_cache[feed_posts[i].id] ?? estimated_height;
		}

		return {
			posts: feed_posts.slice(start_index, end_index + 1),
			top_spacer,
			bottom_spacer
		};
	});

	function scroll_filters(direction: 'left' | 'right'): void {
		if (!pills_container) return;
		const scroll_amount = 220;
		pills_container.scrollBy({
			left: direction === 'left' ? -scroll_amount : scroll_amount,
			behavior: 'smooth'
		});
	}

	async function load_popular_tags(): Promise<void> {
		tags_loading = true;
		try {
			const res = await fetch('/api/tags/popular');
			if (res.ok) {
				const data = await res.json();
				dynamic_tags = (data.tags || []).map((t: { id: string; label: string }) => ({
					id: t.id,
					label: t.label,
					icon: Hash
				}));
			}
		} catch (error) {
			console.error('Failed to load popular tags:', error);
		} finally {
			tags_loading = false;
		}
	}

	async function load_posts(tag: string, is_initial = false): Promise<void> {
		if (is_initial) {
			loading = true;
			offset = 0;
			has_more = true;
			feed_posts = [];
		} else {
			if (!has_more || fetching_more) return;
			fetching_more = true;
		}

		try {
			const params = new SvelteURLSearchParams({
				tag: tag,
				limit: page_size.toString(),
				offset: offset.toString()
			});

			const res = await fetch(`/api/posts?${params.toString()}`);
			if (res.ok) {
				const data = await res.json();
				const new_posts = data.posts || [];
				
				if (is_initial) {
					feed_posts = new_posts;
				} else {
					const existing_ids = new Set(feed_posts.map(p => p.id));
					const unique_new_posts = new_posts.filter((p: PostData) => !existing_ids.has(p.id));
					feed_posts = [...feed_posts, ...unique_new_posts];
				}

				has_more = new_posts.length === page_size;
				offset += new_posts.length;
			}
		} catch (error) {
			console.error('Failed to load explore feed:', error);
		} finally {
			loading = false;
			fetching_more = false;
		}
	}

	// --- Actions & Helpers ---
	function handle_height_change(id: string, height: number) {
		if (height_cache[id] !== height) {
			height_cache[id] = height;
		}
	}

	function handle_scroll(e?: Event) {
		let st = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
		if (e?.target && (e.target as HTMLElement).scrollTop !== undefined) {
			st = Math.max(st, (e.target as HTMLElement).scrollTop);
		}
		scroll_top = st;
	}

	function handle_resize() {
		viewport_height = Math.max(window.innerHeight || 0, 1500);
	}

	// --- Lifecycle & Effects ---
	$effect(() => {
		load_popular_tags();
	});

	$effect(() => {
		const tag = active_filter;
		untrack(() => {
			load_posts(tag, true);
		});
	});

	onMount(() => {
		handle_resize();
		window.addEventListener('scroll', handle_scroll, { passive: true, capture: true });
		window.addEventListener('resize', handle_resize, { passive: true });
		
		return () => {
			window.removeEventListener('scroll', handle_scroll, { capture: true });
			window.removeEventListener('resize', handle_resize);
		};
	});

	// Infinite Scroll Observer
	$effect(() => {
		if (!sentinel_el) return;

		const observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) {
				if (has_more && !fetching_more) {
					const tag = active_filter;
					untrack(() => load_posts(tag, false));
				}
			}
		}, { rootMargin: '800px' });

		observer.observe(sentinel_el);
		return () => observer.disconnect();
	});

	function handle_post_delete(post_id: string): void {
		feed_posts = feed_posts.filter((p) => p.id !== post_id);
		delete height_cache[post_id];
	}

	function handle_post_edit(post_id: string, new_content: string): void {
		const post_index = feed_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		feed_posts[post_index] = {
			...feed_posts[post_index],
			content: new_content,
			is_edited: true
		};
	}

	function handle_metric_change(
		post_id: string,
		type: 'like' | 'dislike' | 'repost',
		new_metrics: { likes: number; dislikes: number; reposts: number; user_liked: boolean; user_disliked: boolean; user_reposted: boolean }
	): void {
		const post_index = feed_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		feed_posts[post_index] = {
			...feed_posts[post_index],
			metrics: {
				likes: new_metrics.likes,
				dislikes: new_metrics.dislikes,
				reposts: new_metrics.reposts
			},
			user_liked: new_metrics.user_liked,
			user_disliked: new_metrics.user_disliked,
			user_reposted: new_metrics.user_reposted
		};
	}
</script>

{#if $session.data}
	<div class="explore-page">
		<header class="explore-header">
			<h1 class="page-title">Explore</h1>

			<div class="filter-wrapper">
				<button class="scroll-btn" onclick={() => scroll_filters('left')}>
					<ChevronLeft size={18} strokeWidth={2.5} />
				</button>

				<div class="filter-pills" bind:this={pills_container}>
					{#if tags_loading}
						<div class="pills-loading">Loading tags...</div>
					{:else}
						{#each all_filters as f (f.id)}
							<button
								class="pill"
								class:active={active_filter === f.id}
								onclick={() => (active_filter = f.id)}
							>
								<span class="filter-icon">
									<f.icon size={16} strokeWidth={2.25} />
								</span>
								{f.label}
							</button>
						{/each}
					{/if}
				</div>

				<button class="scroll-btn" onclick={() => scroll_filters('right')}>
					<ChevronRight size={18} strokeWidth={2.5} />
				</button>
			</div>
		</header>

		<section class="feed-column" aria-label="Posts">
			{#if loading}
				<div class="empty-state loading-state">
					<p>Loading explore feed...</p>
				</div>
			{:else if feed_posts.length > 0}
				<div class="virtual-list-container">
					<div class="spacer top-spacer" style="height: {virtual_feed.top_spacer}px;"></div>

					{#each virtual_feed.posts as post (post.id)}
						<VirtualizedPost
							{post}
							on_metric_change={handle_metric_change}
							on_delete={handle_post_delete}
							on_edit={handle_post_edit}
							on_height_change={handle_height_change}
						/>
					{/each}

					<div class="spacer bottom-spacer" style="height: {virtual_feed.bottom_spacer}px;"></div>
				</div>

				<!-- Sentinel for Infinite Scroll -->
				<div bind:this={sentinel_el} class="sentinel">
					{#if fetching_more}
						<div class="fetching-more-spinner">
							<p>Loading more posts...</p>
						</div>
					{/if}
				</div>
			{:else}
				<div class="empty-state">
					<p>No posts found for this category at the moment.</p>
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
	.explore-page {
		min-height: 100vh;
		width: calc(100% + 3rem);
		margin: -1.5rem;
		background: #f8fbff;
	}

	.explore-header {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem;
		box-sizing: border-box;
		position: sticky;
		top: 0;
		background: #f8fbff;
		z-index: 10;
		border-bottom: 1px solid #e1e8ed;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0 0 1rem 0;
	}

	.filter-wrapper {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.filter-pills {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		scroll-behavior: smooth;
		flex: 1;

		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.filter-pills::-webkit-scrollbar {
		display: none;
	}

	.scroll-btn {
		border: 1px solid #e2e8f0;
		background: #ffffff;
		color: #334155;
		border-radius: 999px;
		width: 32px;
		height: 32px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		flex-shrink: 0;
		box-shadow: 0 1px 2px rgba(0,0,0,0.05);
	}

	.scroll-btn:hover {
		background: #f1f5f9;
		border-color: #cbd5f5;
	}

	.loading {
		min-height: calc(100vh - var(--navbar-height));
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0;
		gap: 0.35rem;
		padding: 0.4rem 0.85rem;
		border: 1px solid #d0d7e2;
		border-radius: 999px;
		background: #f7f9fc;
		color: #334155;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.pill.active {
		background: #0ea5e9;
		color: #ffffff;
		border-color: #0ea5e9;
	}

	.feed-column {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem 0 1.25rem;
	}

	.empty-state {
		padding: 60px 20px;
		text-align: center;
		color: #64748b;
	}

	.virtual-list-container {
		position: relative;
		width: 100%;
	}

	.spacer {
		width: 100%;
		pointer-events: none;
	}

	.sentinel {
		height: 20px;
		margin-top: 2rem;
		padding-bottom: 4rem;
	}

	.fetching-more-spinner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		color: #64748b;
		font-size: 0.9rem;
		font-weight: 500;
		padding: 1rem 0;
	}
</style>