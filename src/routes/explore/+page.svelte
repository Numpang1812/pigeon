<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { Flame, Hash, Sparkles } from 'lucide-svelte';
	import type { Component } from 'svelte';
	import { Post } from '$lib';

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
		post_tags: string[];
		posted_at: string;
		content: string;
		author_name: string;
		author_handle: string;
		author_bio?: string;
		avatar_url?: string;
		verified?: boolean;
		metrics: {
			likes: number;
			dislikes: number;
			reposts: number;
		};
		user_liked?: boolean;
		user_disliked?: boolean;
		user_reposted?: boolean;
		is_author?: boolean;
		is_edited?: boolean;
	}

	let dynamic_tags = $state<Tag[]>([]);
	let active_filter = $state<string>('foryou');

	let feed_posts = $state<PostData[]>([]);
	let loading = $state(true);
	let tags_loading = $state(true);

	const all_filters = $derived([...static_filters, ...dynamic_tags]);

	async function load_popular_tags() {
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

	async function load_posts(tag: string) {
		loading = true;
		try {
			const res = await fetch(`/api/posts?tag=${encodeURIComponent(tag)}&limit=50`);
			if (res.ok) {
				const data = await res.json();
				feed_posts = data.posts || [];
			}
		} catch (error) {
			console.error('Failed to load explore feed:', error);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load_popular_tags();
	});

	$effect(() => {
		load_posts(active_filter);
	});

	function handle_post_delete(post_id: string): void {
		feed_posts = feed_posts.filter((p) => p.id !== post_id);
	}

	function handle_post_edit(post_id: string, new_content: string): void {
		const post_index = feed_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		const updated_post = {
			...feed_posts[post_index],
			content: new_content,
			is_edited: true
		};

		feed_posts = [
			...feed_posts.slice(0, post_index),
			updated_post,
			...feed_posts.slice(post_index + 1)
		];
	}
</script>

{#if $session.data}
	<div class="explore-page">
		<header class="explore-header">
			<h1 class="page-title">Explore</h1>
			<div class="filter-pills">
				{#if tags_loading}
					<div class="pills-loading">Loading tags...</div>
				{:else}
					{#each all_filters as f (f.id)}
						<button
							class="pill"
							class:active={active_filter === f.id}
							onclick={() => (active_filter = f.id)}
						>
							<span class="filter-icon"><f.icon size={16} strokeWidth={2.25} /></span>
							{f.label}
						</button>
					{/each}
				{/if}
			</div>
		</header>

		<section class="feed-column" aria-label="Posts">
			{#if loading}
				<div class="empty-state loading-state">
					<p>Loading explore feed...</p>
				</div>
			{:else if feed_posts.length > 0}
				{#each feed_posts as post (post.id)}
					<Post
						post_id={post.id}
						post_tag={post.post_tag}
						post_tags={post.post_tags}
						posted_at={post.posted_at}
						content={post.content}
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
						on_delete={handle_post_delete}
						on_edit={handle_post_edit}
					/>
				{/each}
			{:else}
				<div class="empty-state">
					<p>No posts found for this category at the moment.</p>
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
		transition: all 0.2s ease;
		min-width: 0;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0 0 1rem 0;
	}

	.filter-pills {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		width: 100%;
		min-width: 0; /* Ensures the container can shrink below its children's intrinsic width */
		padding: 0.5rem 0 1rem 0;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE and Edge */
		-webkit-overflow-scrolling: touch;
		mask-image: linear-gradient(to right, black 90%, transparent 100%);
		-webkit-mask-image: linear-gradient(to right, black 90%, transparent 100%);
	}

	.filter-pills::-webkit-scrollbar {
		display: none; /* Chrome, Safari and Opera */
	}

	.pill {
		display: inline-flex;
		align-items: center;
		flex-shrink: 0; /* Prevent pills from squashing */
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
		transition: all 150ms ease;
	}

	.pill:hover {
		background: #eef3fb;
	}

	.pill.active {
		background: #0ea5e9;
		color: #ffffff;
		border-color: #0ea5e9;
	}

	.filter-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.feed-column {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem 0 1.25rem;
		box-sizing: border-box;
	}

	.empty-state {
		padding: 60px 20px;
		text-align: center;
		color: #64748b;
	}

	.login-prompt,
	.loading {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.login-link {
		color: #1da1f2;
		font-weight: 700;
		text-decoration: none;
	}

	@media (max-width: 900px) {
		.explore-page {
			width: calc(100% + 2rem);
			margin: -1rem;
		}

		.explore-header {
			padding: 1rem;
			max-width: 100vw;
		}

		.feed-column {
			padding: 0.85rem 1rem 0 1rem;
		}

		.filter-pills {
			mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%);
			-webkit-mask-image: linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%);
		}
	}
</style>
