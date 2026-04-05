<script lang="ts">
	import { resolve } from '$app/paths';
	import { Post } from '$lib';
	import { ArrowLeft, Calendar, Camera, X } from 'lucide-svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import { invalidateAll } from '$app/navigation';

	type ProfileConnection = {
		id: string;
		name: string;
		handle: string;
		avatar: string;
		followed_at: string;
	};

	type ProfilePost = {
		id: string;
		post_tag: string;
		post_tags: string[];
		posted_at: string;
		author_name: string;
		author_handle: string;
		content: string;
		audience: string;
		author_bio: string;
		verified: boolean;
		metrics: {
			likes: number;
			dislikes: number;
			reposts: number;
		};
		user_liked: boolean;
		user_disliked: boolean;
		user_reposted: boolean;
		avatar_url: string;
	};

	type ProfileData = {
		profile: {
			id: string;
			name: string;
			handle: string;
			bio: string;
			joined: string;
			avatar: string;
			cover: string;
			following: number;
			followers: number;
		};
		posts: ProfilePost[];
		followers: ProfileConnection[];
		following: ProfileConnection[];
		access?: {
			is_owner?: boolean;
			is_following?: boolean;
		};
	};

	interface ProfilePageViewProps {
		data: ProfileData;
		show_back_button?: boolean;
		enable_follow_ui?: boolean;
		force_owner?: boolean;
	}

	const props: ProfilePageViewProps = $props();

	const tabs = ['Posts', 'Replies', 'Media', 'Likes'] as const;
	let active_tab = $state<(typeof tabs)[number]>('Posts');

	const is_owner = $derived(props.force_owner ?? props.data.access?.is_owner ?? false);
	const show_back_button = $derived(props.show_back_button ?? false);
	const enable_follow_ui = $derived(props.enable_follow_ui ?? false);

	const is_following = $derived(props.data.access?.is_following ?? false);

	let show_avatar_uploader = $state(false);
	let avatar_url = $state<string | null>(null);
	let show_connections_modal = $state<'followers' | 'following' | null>(null);

	const profile = $derived(props.data.profile);
	const posts_source = $derived(props.data.posts as ProfilePost[]);
	const post_overrides = $state<Record<string, ProfilePost>>({});
	const local_posts = $derived(posts_source.map((p) => post_overrides[p.id] ?? p));

	async function handle_avatar_success(new_url: string) {
		avatar_url = new_url;
		show_avatar_uploader = false;
		await invalidateAll();
	}

	function handle_avatar_click() {
		if (!is_owner) {
			return;
		}

		show_avatar_uploader = true;
	}

	function close_avatar_uploader() {
		show_avatar_uploader = false;
	}

	function go_back() {
		if (window.history.length > 1) {
			window.history.back();
			return;
		}

		window.location.href = resolve('/home');
	}

	function handle_backdrop_keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			close_avatar_uploader();
		}
	}

	function stop_event_propagation(event: Event) {
		event.stopPropagation();
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
		const post_index = local_posts.findIndex((p) => p.id === post_id);
		if (post_index === -1) return;

		const updated_post = {
			...local_posts[post_index],
			metrics: {
				likes: new_metrics.likes,
				dislikes: new_metrics.dislikes,
				reposts: new_metrics.reposts
			},
			user_liked: new_metrics.user_liked,
			user_disliked: new_metrics.user_disliked,
			user_reposted: new_metrics.user_reposted
		};

		post_overrides[post_id] = updated_post;
	}
</script>

<svelte:head>
	<title>{profile.name} (@{profile.handle}) · Pigeon</title>
</svelte:head>

<div class="profile-layout">
	<div class="main-feed border-x">
		{#if show_back_button}
			<header class="profile-topbar">
				<button class="back-button" type="button" onclick={go_back} aria-label="Go back">
					<ArrowLeft size={20} />
				</button>
				<div class="topbar-meta">
					<h2>{profile.name}</h2>
				</div>
			</header>
		{/if}

		<div class="profile-header">
			<div class="cover-image-container">
				<img src={profile.cover} alt="Cover" class="cover-image" />
			</div>

			<div class="profile-actions-row">
				{#if is_owner}
					<button class="avatar-container" onclick={handle_avatar_click} aria-label="Change avatar">
						<img src={avatar_url || profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&size=256&background=1DA1F2&color=fff`} alt="Avatar" class="avatar-image" />
						<div class="avatar-overlay">
							<Camera size={32} />
						</div>
					</button>
				{:else}
					<div class="avatar-container static-avatar" aria-hidden="true">
						<img src={avatar_url || profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&size=256&background=1DA1F2&color=fff`} alt="Avatar" class="avatar-image" />
					</div>
				{/if}
				<div class="action-buttons">
					{#if is_owner}
						<a href={resolve('/profile/edit')} class="btn btn-outline">Edit profile</a>
					{:else if enable_follow_ui}
						<form method="POST" action="?/toggle_follow">
							<button type="submit" class={`btn ${is_following ? 'btn-outline' : 'btn-muted'}`}>
								{is_following ? 'Following' : 'Follow'}
							</button>
						</form>
					{/if}
				</div>
			</div>

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
					<button type="button" class="stat-link" disabled>
						<span class="stat-value">{local_posts.length}</span>
						<span class="stat-label">Posts</span>
					</button>
					<button type="button" class="stat-link" onclick={() => (show_connections_modal = 'following')}>
						<span class="stat-value">{profile.following}</span>
						<span class="stat-label">Following</span>
					</button>
					<button type="button" class="stat-link" onclick={() => (show_connections_modal = 'followers')}>
						<span class="stat-value">{profile.followers >= 1000 ? `${(profile.followers / 1000).toFixed(1)}K` : profile.followers}</span>
						<span class="stat-label">Followers</span>
					</button>
				</div>
			</div>

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

		<section class="feed-column" id="posts" aria-label="Posts">
			{#if active_tab === 'Posts'}
				{#each local_posts as post (post.id)}
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
						on_metric_change={handle_metric_change}
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

	{#if is_owner && show_avatar_uploader}
		<div
			class="modal-backdrop"
			onclick={close_avatar_uploader}
			onkeydown={handle_backdrop_keydown}
			role="button"
			tabindex="0"
			aria-label="Close avatar uploader"
		>
			<div
				class="modal-content"
				onclick={stop_event_propagation}
				onkeydown={stop_event_propagation}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<AvatarUploader
					current_avatar_url={avatar_url || profile.avatar}
					on_success={handle_avatar_success}
					on_close={close_avatar_uploader}
				/>
			</div>
		</div>
	{/if}

	{#if show_connections_modal}
		<div
			class="modal-backdrop"
			onclick={() => (show_connections_modal = null)}
			onkeydown={(e) => e.key === 'Escape' && (show_connections_modal = null)}
			role="button"
			tabindex="0"
			aria-label="Close connections"
		>
			<div
				class="connections-modal"
				onclick={stop_event_propagation}
				onkeydown={stop_event_propagation}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<div class="modal-header">
					<h2>{show_connections_modal === 'following' ? 'Following' : 'Followers'}</h2>
					<button
						type="button"
						class="modal-close"
						onclick={() => (show_connections_modal = null)}
						aria-label="Close"
					>
						<X size={18} strokeWidth={2.5} />
					</button>
				</div>

				<div class="modal-body">
					{#if show_connections_modal === 'following'}
						{#if props.data.following.length > 0}
							<div class="connection-list">
								{#each props.data.following as user (user.id)}
									<a class="connection-item" href={resolve(`/profile/${user.handle}`)}>
										<img src={user.avatar || 'https://i.pravatar.cc/40'} alt={user.name} />
										<div>
											<strong>{user.name}</strong>
											<p>@{user.handle}</p>
										</div>
									</a>
								{/each}
							</div>
						{:else}
							<p class="connection-empty">Not following anyone yet.</p>
						{/if}
					{:else if show_connections_modal === 'followers'}
						{#if props.data.followers.length > 0}
							<div class="connection-list">
								{#each props.data.followers as user (user.id)}
									<a class="connection-item" href={resolve(`/profile/${user.handle}`)}>
										<img src={user.avatar || 'https://i.pravatar.cc/40'} alt={user.name} />
										<div>
											<strong>{user.name}</strong>
											<p>@{user.handle}</p>
										</div>
									</a>
								{/each}
							</div>
						{:else}
							<p class="connection-empty">No followers yet.</p>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.profile-layout {
		min-height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	.main-feed {
		width: 100%;
		max-width: 980px;
		min-height: 100%;
	}

	.profile-topbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid #e1e8ed;
		background-color: white;
	}

	.back-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 9999px;
		border: none;
		background: transparent;
		cursor: pointer;
		color: #14171a;
	}

	.back-button:hover {
		background: #eff3f4;
	}

	.topbar-meta h2 {
		font-size: 20px;
		font-weight: 800;
		margin: 0;
		color: #14171a;
	}

	.border-x {
		border-left: none;
		border-right: none;
	}

	.profile-header {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid #e1e8ed;
		padding: 1.5rem 1.5rem 0;
		background-color: white;
	}

	.cover-image-container {
		height: 200px;
		background-color: #aab8c2;
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
		border: 4px solid #ffffff;
		background-color: #ffffff;
		overflow: hidden;
		position: relative;
		cursor: pointer;
		transition: transform 0.2s;
		padding: 0;
	}

	.static-avatar {
		cursor: default;
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
		margin-top: 78px;
		display: flex;
		align-items: flex-start;
	}

	.action-buttons form {
		margin: 0;
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
		text-decoration: none;
	}

	.btn-outline {
		background-color: transparent;
		color: #14171a;
		border: 1px solid #e1e8ed;
	}

	.btn-outline:hover {
		background-color: #f5f8fa;
	}

	.btn-muted {
		background-color: #14171a;
		color: white;
		border: 1px solid #14171a;
	}

	.user-info {
		padding: 0 16px;
		margin-bottom: 16px;
	}

	.user-name {
		font-size: 20px;
		font-weight: 800;
		color: #14171a;
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
		color: #14171a;
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
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: none;
		font-size: 15px;
		display: flex;
		gap: 4px;
		flex-direction: column;
		align-items: center;
		padding: 0;
		color: inherit;
		font-family: inherit;
	}

	.stat-link:not(:disabled):hover {
		text-decoration: underline;
	}

	.stat-link:disabled {
		cursor: default;
	}

	.stat-value {
		font-weight: 700;
		color: #14171a;
	}

	.stat-label {
		color: #657786;
	}

	.profile-tabs {
		display: flex;
		border-bottom: 1px solid #e1e8ed;
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
		background-color: #f5f8fa;
	}

	.tab.active {
		font-weight: 700;
		color: #14171a;
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 56px;
		height: 4px;
		border-radius: 9999px;
		background-color: #1da1f2;
	}

	.feed-column {
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
	}

	.connections-modal {
		background: white;
		border-radius: 28px;
		width: 100%;
		max-width: 720px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		animation: modal_slide_in 0.3s ease-out;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1rem;
		border-bottom: 2px solid #f1f5f9;
		background: #fafbfc;
		border-radius: 28px 28px 0 0;
	}

	.modal-header h2 {
		font-size: 23px;
		font-weight: 700;
		margin: 0;
		margin-left: 10px;
		color: #0f1419;
		letter-spacing: -0.5px;
	}

	.modal-close {
		background: #e8ecf1;
		border: none;
		font-size: 24px;
		line-height: 1;
		cursor: pointer;
		color: #536471;
		padding: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.modal-close:hover {
		background-color: #d4d9df;
		color: #0f1419;
	}

	.modal-body {
		overflow-y: auto;
		padding: 1.5rem 0;
		flex: 1;
		scroll-behavior: smooth;
	}

	.modal-body::-webkit-scrollbar {
		width: 8px;
	}

	.modal-body::-webkit-scrollbar-track {
		background: #f1f5f9;
	}

	.modal-body::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 4px;
	}

	.modal-body::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}

	.connection-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 1.5rem;
	}

	.connection-item {
		width: 100%;
		border: 1px solid transparent;
		background: transparent;
		display: flex;
		align-items: center;
		gap: 1.2rem;
		padding: 1.2rem 1.2rem;
		border-radius: 16px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s ease;
	}

	.connection-item:hover {
		background: #f0f3f7;
		border-color: #e1e8ed;
	}

	.connection-item img {
		width: 56px;
		height: 56px;
		border-radius: 9999px;
		object-fit: cover;
		flex-shrink: 0;
		border: 2px solid #e1e8ed;
	}

	.connection-item strong {
		display: block;
		font-size: 16px;
		font-weight: 600;
		color: #0f1419;
		line-height: 1.4;
	}

	.connection-item p {
		margin: 0;
		font-size: 15px;
		color: #536471;
		line-height: 1.4;
	}

	.connection-empty {
		margin: 0;
		color: #536471;
		font-size: 15px;
		text-align: center;
		padding: 3rem 2rem;
		line-height: 1.6;
	}

	.empty-state {
		padding: 40px 20px;
		text-align: center;
		color: #14171a;
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
		animation: backdrop_fade_in 0.22s ease-out;
	}

	.modal-content {
		position: relative;
		max-width: 500px;
		width: 100%;
		animation: modal_slide_in 0.26s ease-out;
	}

	.connections-modal {
		will-change: transform, opacity;
	}

	@keyframes modal_slide_in {
		from {
			opacity: 0;
			transform: translateY(18px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes backdrop_fade_in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
