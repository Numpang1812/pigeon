<script lang="ts">
	import { PostTextbox } from '$lib';
	import VirtualizedPost from '$lib/components/VirtualizedPost.svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import {Sparkles} from 'lucide-svelte';

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { data } = $props<{ data: PageData }>();

	type FeedPost = {
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
	};

	// --- State ---
	let feed_posts = $state<FeedPost[]>([]);
	let loading = $state(true);
	let fetching_more = $state(false);
	let has_more = $state(true);
	let offset = $state(0);
	const page_size = 50;

	// --- Virtualization State ---
	const height_cache = $state<Record<string, number>>({});
	let scroll_top = $state(0);
	let viewport_height = $state(1000);
	let sentinel_el = $state<HTMLElement>();

	const buffer_count = 15;
	const estimated_height = 260;

	// --- Derived Visible Posts ---
	const virtual_feed = $derived.by(() => {
		let current_y = 0;
		let start_index = -1;
		let end_index = feed_posts.length - 1;
		
		// Find start index
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

		// Calculate Spacers
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

	async function load_posts(is_initial = false) {
		if (is_initial) {
			loading = true;
			offset = 0;
			has_more = true;
		} else {
			if (!has_more || fetching_more) return;
			fetching_more = true;
		}

		try {
			const params = new SvelteURLSearchParams({ 
				limit: page_size.toString(),
				offset: offset.toString()
			});
			
			if (is_initial && typeof window !== 'undefined') {
				const requested_post_id = new SvelteURLSearchParams(window.location.search).get('post_id');
				if (requested_post_id) {
					params.set('post_id', requested_post_id);
				}
			}

			const response = await fetch(`/api/posts?${params.toString()}`);
			if (response.ok) {
				const data = await response.json();
				const new_posts = data.posts;
				
				if (is_initial) {
					feed_posts = new_posts;
				} else {
					// Deduplicate to prevent Svelte each block crash from shifting DB rows
					const existing_ids = new Set(feed_posts.map(p => p.id));
					const unique_new_posts = new_posts.filter((p: FeedPost) => !existing_ids.has(p.id));
					feed_posts = [...feed_posts, ...unique_new_posts];
				}

				has_more = new_posts.length === page_size;
				offset += new_posts.length;

				if (is_initial) {
					requestAnimationFrame(scroll_to_hash_post);
				}
			}
		} catch (error) {
			console.error('Failed to load posts:', error);
		} finally {
			loading = false;
			fetching_more = false;
		}
	}

	function scroll_to_hash_post(attempt = 0): void {
		if (typeof window === 'undefined') return;

		const hash_id = window.location.hash
			? window.location.hash.startsWith('#')
				? window.location.hash.slice(1)
				: window.location.hash
			: '';
		const requested_post_id = new URLSearchParams(window.location.search).get('post_id');
		const target_id = hash_id || (requested_post_id ? `post-${requested_post_id}` : '');
		if (!target_id) return;

		const post_element = document.getElementById(target_id);

		if (!(post_element instanceof HTMLElement)) {
			// If not in DOM, we might need to scroll roughly to where it should be
			// to trigger it entering the viewport and being rendered
			const post_index = feed_posts.findIndex(p => `post-${p.id}` === target_id);
			if (post_index !== -1 && attempt === 0) {
				let y = 0;
				for (let i = 0; i < post_index; i++) {
					y += height_cache[feed_posts[i].id] ?? estimated_height;
				}
				window.scrollTo({ top: y, behavior: 'smooth' });
				setTimeout(() => scroll_to_hash_post(attempt + 1), 100);
				return;
			}

			if (attempt < 8) {
				setTimeout(() => scroll_to_hash_post(attempt + 1), 120);
			}
			return;
		}

		post_element.scrollIntoView({ behavior: 'smooth', block: 'center' });
		
		// Flash effect
		post_element.classList.remove('flash-target');
		requestAnimationFrame(() => {
			post_element.classList.add('flash-target');
			setTimeout(() => post_element.classList.remove('flash-target'), 2200);
		});

		if (attempt < 2) {
			setTimeout(() => scroll_to_hash_post(attempt + 1), 180);
		}
	}

	async function handle_post_submit(): Promise<void> {
		await load_posts(true);
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

	function handle_post_delete(post_id: string): void {
		feed_posts = feed_posts.filter((p) => p.id !== post_id);
		delete height_cache[post_id];
	}

	function handle_post_edit(
		post_id: string,
		update: string | { content: string; post_tag: string; post_tags: string[] }
	): void {
		const post_index = feed_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		if (typeof update === 'string') {
			feed_posts[post_index] = {
				...feed_posts[post_index],
				content: update,
				is_edited: true
			};
			return;
		}

		feed_posts[post_index] = {
			...feed_posts[post_index],
			content: update.content,
			post_tag: update.post_tag,
			post_tags: update.post_tags,
			is_edited: true
		};
	}

	// --- Lifecycle & Effects ---
	onMount(() => {
		handle_resize();
		// Use capture: true to catch scroll events from any internal scrollable container
		window.addEventListener('scroll', handle_scroll, { passive: true, capture: true });
		window.addEventListener('resize', handle_resize, { passive: true });
		
		// Initial load
		load_posts(true);

		return () => {
			window.removeEventListener('scroll', handle_scroll, { capture: true });
			window.removeEventListener('resize', handle_resize);
		};
	});

	// Infinite Scroll Observer
	$effect(() => {
		if (!sentinel_el) return;

		// We use a local reference to avoid re-running when fetching_more changes
		const observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) {
				// Use untrack to avoid the effect depending on has_more/fetching_more
				if (has_more && !fetching_more) {
					load_posts();
				}
			}
		}, { rootMargin: '800px' });

		observer.observe(sentinel_el);
		return () => observer.disconnect();
	});
</script>

<main class="home-feed-page" aria-label="Home feed page">

	<div class="composer-wrap">
		<PostTextbox on_submit={handle_post_submit} isExpanded={false} />
		<p class="tip">
			<Sparkles size={14} />
			<span>Tip: Use #hashtags to reach more people (Up to 5 hashtags)</span>
		</p>
	</div>

	<section class="feed-column" aria-label="Posts">
		{#if loading}
			<div class="loading-state">
				<p>Loading posts...</p>
			</div>
		{:else if feed_posts.length === 0}
			<div class="empty-state">
				<h2>No posts yet</h2>
				<p>Be the first to post something!</p>
			</div>
		{:else}
			<div class="virtual-list-container">
				<!-- Top Spacer -->
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

				<!-- Bottom Spacer -->
				<div class="spacer bottom-spacer" style="height: {virtual_feed.bottom_spacer}px;"></div>
				
				<!-- Sentinel for Infinite Scroll -->
				<div bind:this={sentinel_el} class="sentinel">
					{#if fetching_more}
						<div class="fetching-more-spinner">
							<p>Loading more posts...</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</section>
</main>

<style>
	.tip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0.8rem auto -0.4rem;
		font-size: 0.75rem;
		color: #8094af;
		
	}

	.home-feed-page {
		min-height: 100vh;
		width: calc(100% + 3rem);
		margin: -1.5rem;
	}

	.feed-column {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem 0 1.25rem;
		box-sizing: border-box;
	}

	.composer-wrap {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem;
		box-sizing: border-box;
		border-bottom: 1px solid #e2e8f0;
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
		text-align: center;
		color: #64748b;
		padding: 2rem;
	}

	.loading-state,
	.empty-state {
		padding: 60px 20px;
		text-align: center;
	}

	.loading-state p {
		color: #64748b;
		font-size: 1rem;
	}

	.empty-state h2 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0 0 0.5rem 0;
	}

	.empty-state p {
		color: #64748b;
		font-size: 1rem;
		margin: 0;
	}

	@media (max-width: 900px) {
		.home-feed-page {
			width: calc(100% + 2rem);
			margin: -1rem;
		}

		.feed-column {
			padding: 0.85rem 1rem 0 1rem;
		}

		.composer-wrap {
			padding: 1rem;
		}
	}
</style>
