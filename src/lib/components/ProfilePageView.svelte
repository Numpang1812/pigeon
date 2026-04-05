<script lang="ts">
	import { resolve } from '$app/paths';
	import { Post } from '$lib';
	import { ArrowLeft, Calendar, Camera } from 'lucide-svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import { invalidateAll } from '$app/navigation';

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

	let is_following_override = $state<boolean | null>(null);
	const is_following = $derived(is_following_override ?? (props.data.access?.is_following ?? false));

	let show_avatar_uploader = $state(false);
	let avatar_url = $state<string | null>(null);

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

	function toggle_follow_ui() {
		is_following_override = !is_following;
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
						<button type="button" class={`btn ${is_following ? 'btn-outline' : 'btn-muted'}`} onclick={toggle_follow_ui}>
							{is_following ? 'Following' : 'Follow'}
						</button>
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
					<a href="#following" class="stat-link">
						<span class="stat-value">{local_posts.length}</span>
						<span class="stat-label">Posts</span>
					</a>
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

		<section class="feed-column" aria-label="Posts">
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
	}

	.modal-content {
		position: relative;
		max-width: 500px;
		width: 100%;
		animation: modal_slide_in 0.3s ease-out;
	}

	@keyframes modal_slide_in {
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
