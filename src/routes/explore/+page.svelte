<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import Sidebar from '$lib/component/Sidebar.svelte';
	import Navbar from '$lib/component/Navbar.svelte';
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
			reports?: number;
		};
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
			metrics: { likes: 12400, reports: 2 },
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
			metrics: { likes: 28100, reports: 5 },
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
			metrics: { likes: 15000, reports: 0 },
			avatar_url: 'https://i.pravatar.cc/150?u=3'
		},
		{
			id: '4',
			post_tag: 'music',
			post_tags: ['music', 'festival'],
			posted_at: '30m',
			author_name: 'Harbor Lens',
			author_handle: 'harborlens',
			content: 'Opera House acoustics are unmatched. Incredible performance tonight.',
			author_bio: 'Music critic and producer.',
			metrics: { likes: 7800, reports: 1 },
			avatar_url: 'https://i.pravatar.cc/150?u=4'
		},
		{
			id: '5',
			post_tag: 'trending',
			post_tags: ['trending', 'culture'],
			posted_at: '10m',
			author_name: 'Street Pulse',
			author_handle: 'streetpulse',
			content: 'Carnival in Rio! The costumes, the music, the vibes are absolutely immaculate.',
			author_bio: 'Capturing culture on the streets.',
			verified: false,
			metrics: { likes: 41000 },
			avatar_url: 'https://i.pravatar.cc/150?u=5'
		}
	];

	const filtered_posts = $derived(
		active_filter === 'foryou' ? posts : posts.filter((p) => p.post_tags.includes(active_filter))
	);
</script>

<svelte:head>
	<title>Explore · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">
			<Navbar />
			<div class="explore">
				<header class="explore-header">
					<div class="explore-title-block">
						<h1 class="explore-title">Explore</h1>
						<p class="explore-sub">
							Posts from creators and moments around the world - trending, iconic, and unexpected.
						</p>
					</div>
					<div class="filter-row" role="tablist" aria-label="Explore categories">
						{#each filters as f (f.id)}
							<button
								type="button"
								role="tab"
								aria-selected={active_filter === f.id}
								class="filter-chip"
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
							/>
						{/each}
					{:else}
						<div class="empty-state">
							<p>No posts found for this category at the moment.</p>
						</div>
					{/if}
				</section>
			</div>
		</main>
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
	.app-shell {
		--sidebar-offset: 260px;
		display: flex;
		gap: 0;
		min-height: 100vh;
	}

	.page-content {
		margin-left: var(--sidebar-offset);
		flex: 1;
		transition: margin-left 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.page-content :global(.navbar) {
		left: var(--sidebar-offset);
		transition: left 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.explore {
		min-height: calc(100vh - 64px);
		margin-top: 64px;
		padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 3rem;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 38%, #ffffff 100%);
		color: #0f172a;
	}

	.explore-header {
		max-width: 980px;
		margin: 0 auto 1.75rem;
	}

	.explore-title-block {
		margin-bottom: 1.25rem;
	}

	.explore-title {
		margin: 0 0 0.35rem;
		font-size: clamp(1.65rem, 3vw, 2rem);
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.explore-sub {
		margin: 0;
		max-width: 42rem;
		font-size: 0.95rem;
		line-height: 1.55;
		color: #64748b;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		border: 1px solid #e2e8f0;
		background: #fff;
		color: #475569;
		font-size: 0.82rem;
		font-weight: 600;
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

	.filter-icon {
		display: inline-flex;
		opacity: 0.9;
	}

	.feed-column {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		box-sizing: border-box;
	}

	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: #64748b;
		font-size: 1.1rem;
	}

	.login-prompt {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		gap: 1rem;
	}

	.login-link {
		color: #1da1f2;
		font-weight: 700;
		text-decoration: none;
	}

	.login-link:hover {
		text-decoration: underline;
	}

	.loading {
		min-height: 100vh;
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
		.app-shell {
			--sidebar-offset: 0px;
		}

		.page-content {
			margin-left: 0;
		}
	}
</style>
