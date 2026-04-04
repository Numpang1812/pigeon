<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { Flame, Globe2, Music2, Sparkles, Trophy } from 'lucide-svelte';
	import { Post } from '$lib';

	const session = auth_client.useSession();

	const filters = [
		{ id: 'foryou', label: 'For you', icon: Sparkles },
		{ id: 'trending', label: 'Trending', icon: Flame },
		{ id: 'world', label: 'World', icon: Globe2 },
		{ id: 'music', label: 'Music', icon: Music2 },
		{ id: 'sports', label: 'Sports', icon: Trophy }
	] as const;

	let active_filter = $state<(typeof filters)[number]['id']>('foryou');

	type ExploreFeedPost = {
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
		metrics?: {
			likes?: number;
			dislikes?: number;
			reposts?: number;
		};
		user_liked?: boolean;
		user_disliked?: boolean;
		user_reposted?: boolean;
	};

	const posts: ExploreFeedPost[] = [
		{
			id: '1',
			post_tag: 'world',
			post_tags: ['world', 'travel'],
			posted_at: '2h',
			author_name: 'Aether Travel',
			author_handle: 'aether.travel',
			content: 'Sunset over Santorini. The colors are unbelievable today.',
			author_bio: 'Travel photographer roaming the world.',
			verified: true,
			metrics: { likes: 12400, dislikes: 20, reposts: 150 },
			avatar_url: 'https://i.pravatar.cc/150?u=1'
		},
		{
			id: '2',
			post_tag: 'trending',
			post_tags: ['trending', 'tech'],
			posted_at: '4h',
			author_name: 'Neon City',
			author_handle: 'neoncity',
			content: 'Shibuya crossing at night never gets old. So much energy.',
			author_bio: 'Urban explorer.',
			metrics: { likes: 28100, dislikes: 50, reposts: 300 },
			avatar_url: 'https://i.pravatar.cc/150?u=2'
		},
		{
			id: '3',
			post_tag: 'sports',
			post_tags: ['sports', 'racing'],
			posted_at: '1h',
			author_name: 'Heatwave',
			author_handle: 'heatwave',
			content: 'Desert dunes rally was intense. Sand everywhere!',
			author_bio: 'Racing team driver.',
			verified: true,
			metrics: { likes: 15000, dislikes: 10, reposts: 200 },
			avatar_url: 'https://i.pravatar.cc/150?u=3'
		},
		{
			id: '4',
			post_tag: 'music',
			post_tags: ['music', 'festival'],
			posted_at: '30m',
			author_name: 'Harbor Lens',
			author_handle: 'harbor.lens',
			content: 'New album dropping next week. Can\'t wait to share it with you all.',
			author_bio: 'Music critic and producer.',
			metrics: { likes: 7800, dislikes: 5, reposts: 80 },
			avatar_url: 'https://i.pravatar.cc/150?u=4'
		}
	];

	let filtered_posts = $derived(
		posts.filter((post) => {
			if (active_filter === 'foryou') return true;
			return post.post_tags.includes(active_filter);
		})
	);
</script>

{#if $session.data}
	<div class="explore-page">
		<header class="explore-header">
			<h1 class="page-title">Explore</h1>
			<div class="filter-pills">
				{#each filters as f (f.id)}
					<button
						class="pill"
						class:active={active_filter === f.id}
						onclick={() => (active_filter = f.id)}
					>
						<span class="filter-icon"><f.icon size={16} strokeWidth={2.25} /></span>
						{f.label}
					</button>
				{/each}
			</div>
		</header>

		<section class="feed-column" aria-label="Posts">
			{#if filtered_posts.length > 0}
				{#each filtered_posts as post (post.id)}
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
	}

	.explore-header {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1.25rem 1.25rem 0;
		box-sizing: border-box;
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
		padding-bottom: 0.5rem;
	}

	.pill {
		display: inline-flex;
		align-items: center;
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

		.feed-column {
			padding: 0.85rem 1rem 0 1rem;
		}
	}
</style>
