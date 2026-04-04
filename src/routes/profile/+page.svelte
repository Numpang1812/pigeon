<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { Post } from '$lib';
	import { Calendar, Camera } from 'lucide-svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	const { data } = $props<{ data: PageData }>();

	const session = auth_client.useSession();

	// Tabs for profile
	const tabs = ['Posts', 'Replies', 'Media', 'Likes'] as const;
	let active_tab = $state<(typeof tabs)[number]>('Posts');

	// Avatar uploader state
	let show_avatar_uploader = $state(false);
	let avatar_url = $state<string | null>(null);

	// Use server-loaded data
	const profile = $derived(data.profile);
	const posts = $derived(data.posts);

	async function handle_avatar_success(new_url: string) {
		avatar_url = new_url;
		show_avatar_uploader = false;
		await invalidateAll();
	}

	function handle_avatar_click() {
		show_avatar_uploader = true;
	}

	function close_avatar_uploader() {
		show_avatar_uploader = false;
	}
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
							<button class="avatar-container" onclick={handle_avatar_click} aria-label="Change avatar">
								<img src={avatar_url || profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&size=256&background=1DA1F2&color=fff`} alt="Avatar" class="avatar-image" />
								<div class="avatar-overlay">
									<Camera size={32} />
								</div>
							</button>
							<div class="action-buttons">
								<a href={resolve('/profile/edit')} class="btn btn-outline">Edit profile</a>
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
									<span class="stat-value">{profile.followers >= 1000 ? `${(profile.followers / 1000).toFixed(1)}K` : profile.followers}</span>
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

		<!-- Avatar uploader modal -->
		{#if show_avatar_uploader}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="modal-backdrop" onclick={close_avatar_uploader}>
				<div class="modal-content" onclick={(e) => e.stopPropagation()}>
					<AvatarUploader
						current_avatar_url={avatar_url || profile.avatar}
						on_success={handle_avatar_success}
						on_close={close_avatar_uploader}
					/>
				</div>
			</div>
		{/if}
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
		position: relative;
		cursor: pointer;
		transition: transform 0.2s;
        padding: 0;
	}

	.avatar-container:hover {
		transform: scale(1.02);
	}

	.avatar-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.avatar-container:hover .avatar-overlay {
		opacity: 1;
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

	/* Modal Styles */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		position: relative;
		max-width: 500px;
		width: 100%;
		animation: modalSlideIn 0.3s ease-out;
	}

	@keyframes modalSlideIn {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>