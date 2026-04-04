<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { Post } from '$lib';
	import { Calendar } from 'lucide-svelte';

	const session = auth_client.useSession();

	// Tabs for profile
	const tabs = ['Posts', 'Replies', 'Media', 'Likes'] as const;
	let active_tab = $state<(typeof tabs)[number]>('Posts');

	// Dummy user profile data
	const profile = {
		name: 'Jane Doe',
		handle: 'janedoe',
		bio: 'Digital creator & software engineer. Exploring the intersection of design and code. 🚀',
		joined: 'Joined January 2024',
		avatar: 'https://i.pravatar.cc/150?u=jane',
		cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
		following: 428,
		followers: 12400
	};

	// Dummy posts using ExploreFeedPost schema
	const posts = [
		{
			id: '1',
			post_tag: 'tech',
			post_tags: ['tech', 'design'],
			posted_at: '2h',
			author_name: profile.name,
			author_handle: profile.handle,
			content: 'Just launched my new portfolio! Built with Svelte 5 and so much coffee ☕️✨',
			author_bio: profile.bio,
			verified: true,
			metrics: { likes: 1240, reports: 0 },
			avatar_url: profile.avatar
		},
		{
			id: '2',
			post_tag: 'life',
			post_tags: ['life', 'update'],
			posted_at: '1d',
			author_name: profile.name,
			author_handle: profile.handle,
			content: 'Sometimes the best debugging tool is just stepping away from the keyboard for a walk.',
			author_bio: profile.bio,
			verified: true,
			metrics: { likes: 856, reports: 1 },
			avatar_url: profile.avatar
		},
		{
			id: '3',
			post_tag: 'design',
			post_tags: ['design', 'ui'],
			posted_at: '3d',
			author_name: profile.name,
			author_handle: profile.handle,
			content: 'Minimalism isn\'t about taking things away until there\'s nothing left, but about removing distractions so the main content shines.',
			author_bio: profile.bio,
			verified: true,
			metrics: { likes: 2045, reports: 0 },
			avatar_url: profile.avatar
		}
	];
</script>

<svelte:head>
	<title>{profile.name} (@{profile.handle}) · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="profile-layout">
		<div class="main-feed border-x">
					<!-- Profile Header -->
					<div class="profile-header">
						<!-- Cover -->
						<div class="cover-image-container">
							<img src={profile.cover} alt="Cover" class="cover-image" />
						</div>

						<!-- Avatar & Actions -->
						<div class="profile-actions-row">
							<div class="avatar-container">
								<img src={profile.avatar} alt="Avatar" class="avatar-image" />
							</div>
							<div class="action-buttons">
								<button class="btn btn-outline">Edit profile</button>
							</div>
						</div>

						<!-- User Info -->
						<div class="user-info">
							<h1 class="user-name">{profile.name}</h1>
							<p class="user-handle">@{profile.handle}</p>

							<p class="user-bio">{profile.bio}</p>

							<div class="user-meta">
								<span class="meta-item">
									<Calendar size={16} strokeWidth={2} color="#657786" style="opacity: 0.8;" />
									{profile.joined}
								</span>
							</div>

							<div class="user-stats">
								<a href="#following" class="stat-link">
									<span class="stat-value">{profile.following}</span>
									<span class="stat-label">Following</span>
								</a>
								<a href="#followers" class="stat-link">
									<span class="stat-value">{(profile.followers / 1000).toFixed(1)}K</span>
									<span class="stat-label">Followers</span>
								</a>
							</div>
						</div>

						<!-- Tabs -->
						<nav class="profile-tabs">
							{#each tabs as tab (tab)}
								<button
									class="tab"
									class:active={active_tab === tab}
									onclick={() => (active_tab = tab)}
								>
									{tab}
									{#if active_tab === tab}
										<div class="tab-indicator"></div>
									{/if}
								</button>
							{/each}
						</nav>
					</div>

					<!-- Feed Column -->
					<section class="feed-column" aria-label="Posts">
						{#if active_tab === 'Posts'}
							{#each posts as post (post.id)}
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
								<h2>No {active_tab.toLowerCase()} yet</h2>
								<p>When there are {active_tab.toLowerCase()}, they will show up here.</p>
							</div>
						{/if}
					</section>
		</div>
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
    
	.profile-layout {
		min-height: 100%;
		width: 100%;
		/* margin: -1.5rem; */
		display: flex;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
        
	}

	.main-feed {
		width: 100%;
		max-width: 980px; /* Aligned with explore feed width */
		min-height: 100%;
	}

	.border-x {
		border-left: none;
		border-right: none;
	}

	.profile-header {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid #E1E8ED;
		padding: 1.5rem 1.5rem 0;
        background-color: white;
	}

	.cover-image-container {
		height: 200px;
		background-color: #AAB8C2;
		overflow: hidden;
	}

	.cover-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.profile-actions-row {
		display: flex;
		justify-content: space-between;
		padding: 0 16px;
		margin-top: -66px;
		margin-bottom: 12px;
	}

	.avatar-container {
		width: 132px;
		height: 132px;
		border-radius: 50%;
		border: 4px solid #FFFFFF;
		background-color: #FFFFFF;
		overflow: hidden;
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.action-buttons {
		margin-top: 78px; /* align with avatar middle */
		display: flex;
		align-items: flex-start;
	}

	.btn {
		cursor: pointer;
		font-family: inherit;
		font-weight: 700;
		font-size: 15px;
		padding: 0 16px;
		min-height: 36px;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s;
	}

	.btn-outline {
		background-color: transparent;
		color: #14171A;
		border: 1px solid #E1E8ED;
	}

	.btn-outline:hover {
		background-color: #F5F8FA;
	}

	.user-info {
		padding: 0 16px;
		margin-bottom: 16px;
	}

	.user-name {
		font-size: 20px;
		font-weight: 800;
		color: #14171A;
		margin: 0;
		line-height: 1.2;
	}

	.user-handle {
		font-size: 15px;
		color: #657786;
		margin: 0 0 12px 0;
	}

	.user-bio {
		font-size: 15px;
		color: #14171A;
		line-height: 1.3;
		margin: 0 0 12px 0;
		white-space: pre-wrap;
	}

	.user-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-bottom: 12px;
	}

	.meta-item {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #657786;
		font-size: 15px;
	}

	.user-stats {
		display: flex;
		gap: 20px;
	}

	.stat-link {
		text-decoration: none;
		font-size: 15px;
		display: flex;
		gap: 4px;
	}

	.stat-link:hover {
		text-decoration: underline;
	}

	.stat-value {
		font-weight: 700;
		color: #14171A;
	}

	.stat-label {
		color: #657786;
	}

	.profile-tabs {
		display: flex;
		border-bottom: 1px solid #E1E8ED; /* double border-bottom fix is handled by parent */
		width: 100%;
	}

	.tab {
		flex: 1;
		background: transparent;
		border: none;
		font-weight: 500;
		font-size: 15px;
		color: #657786;
		padding: 16px 0;
		cursor: pointer;
		position: relative;
		transition: background-color 0.2s;
		font-family: inherit;
	}

	.tab:hover {
		background-color: #F5F8FA;
	}

	.tab.active {
		font-weight: 700;
		color: #14171A;
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 56px;
		height: 4px;
		border-radius: 9999px;
		background-color: #1DA1F2;
	}

	.feed-column {
		display: flex;
		flex-direction: column;
		padding: 1.5rem;

	}

	.empty-state {
		padding: 40px 20px;
		text-align: center;
		color: #14171A;
	}
	
	.empty-state h2 {
		font-size: 31px;
		font-weight: 800;
		margin: 0 0 8px 0;
	}

	.empty-state p {
		font-size: 15px;
		color: #657786;
		margin: 0;
		line-height: 1.3;
	}

	.login-prompt, .loading {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	.login-link {
		color: #1DA1F2;
		font-weight: 700;
		text-decoration: none;
	}

	@media (max-width: 900px) {
		.profile-layout {
			width: calc(100% + 2rem);
			margin: -1rem;
		}

		.border-x {
			border-left: none;
			border-right: none;
		}
	}
</style>