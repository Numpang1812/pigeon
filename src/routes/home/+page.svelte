<script lang="ts">
	import { Post, PostTextbox } from '$lib';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import type { PageData } from './$types';

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

	let feed_posts = $state<FeedPost[]>([]);
	let loading = $state(true);

	function center_post_in_view(post_element: HTMLElement): void {
		post_element.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}

	function flash_target_post(post_element: HTMLElement): void {
		post_element.classList.remove('flash-target');
		requestAnimationFrame(() => {
			post_element.classList.add('flash-target');
			setTimeout(() => {
				post_element.classList.remove('flash-target');
			}, 2200);
		});
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
			if (attempt < 8) {
				setTimeout(() => scroll_to_hash_post(attempt + 1), 120);
			}
			return;
		}

		center_post_in_view(post_element);
		flash_target_post(post_element);

		if (attempt < 2) {
			setTimeout(() => scroll_to_hash_post(attempt + 1), 180);
		}
	}

	async function load_posts() {
		try {
			const params = new SvelteURLSearchParams({ limit: '50' });
			if (typeof window !== 'undefined') {
				const requested_post_id = new SvelteURLSearchParams(window.location.search).get('post_id');
				if (requested_post_id) {
					params.set('post_id', requested_post_id);
				}
			}

			const response = await fetch(`/api/posts?${params.toString()}`);
			if (response.ok) {
				const data = await response.json();
				feed_posts = data.posts;
				requestAnimationFrame(scroll_to_hash_post);
			}
		} catch (error) {
			console.error('Failed to load posts:', error);
		} finally {
			loading = false;
		}
	}
	async function handle_post_submit(): Promise<void> {
		// The PostTextbox component now handles the API call
		// Just reload the feed
		await load_posts();
	}

	function handle_metric_change(
		post_id: string,
		type: 'like' | 'dislike' | 'repost',
		new_metrics: {
			likes: number;
			dislikes: number;
			reposts: number;
			user_liked: boolean;
			user_disliked: boolean;
			user_reposted: boolean;
		}
	): void {
		const post_index = feed_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		const updated_post = {
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

		feed_posts = [
			...feed_posts.slice(0, post_index),
			updated_post,
			...feed_posts.slice(post_index + 1)
		];
	}

	function handle_post_delete(post_id: string): void {
		feed_posts = feed_posts.filter((p) => p.id !== post_id);
	}

	function handle_post_edit(
		post_id: string,
		update: { content: string; post_tag: string; post_tags: string[] }
	): void {
		const post_index = feed_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		const updated_post = {
			...feed_posts[post_index],
			content: update.content,
			post_tag: update.post_tag,
			post_tags: update.post_tags,
			is_edited: true
		};

		feed_posts = [
			...feed_posts.slice(0, post_index),
			updated_post,
			...feed_posts.slice(post_index + 1)
		];
	}

	// Load posts on mount
	$effect(() => {
		load_posts();
	});

	$effect(() => {
		if (feed_posts.length > 0) {
			scroll_to_hash_post();
		}
	});
</script>

<main class="home-feed-page" aria-label="Home feed page">

	<div class="composer-wrap">
		<PostTextbox on_submit={handle_post_submit} isExpanded={false} />
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
			{#each feed_posts as post (post.id)}
				<Post
					post_id={post.id}
					post_tag={post.post_tag}
					post_tags={post.post_tags}
					posted_at={post.posted_at}
					content={post.content}
					audience={post.audience}
					author_name={post.author_name}
					author_handle={post.author_handle}
					author_bio={post.author_bio}
					avatar_url={post.avatar_url}
					verified={post.verified}
					metrics={post.metrics}
					user_liked={post.user_liked}
					user_disliked={post.user_disliked}
					user_reposted={post.user_reposted}
					is_author={post.is_author}
					is_edited={post.is_edited}
					on_metric_change={handle_metric_change}
					on_delete={handle_post_delete}
					on_edit={handle_post_edit}
				/>
			{/each}
		{/if}
	</section>
</main>

<style>
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
