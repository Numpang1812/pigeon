<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Calendar, Camera } from 'lucide-svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';
	import CoverUploader from '$lib/components/CoverUploader.svelte';
	import ProfilePostTabs from '$lib/components/profile/ProfilePostTabs.svelte';
	import ProfileConnectionsModal from '$lib/components/profile/ProfileConnectionsModal.svelte';
	import type { ProfileData, ProfilePost, ProfilePostMetricChange } from '$lib/components/profile/types';
	import { SvelteSet } from 'svelte/reactivity';

	interface ProfilePageViewProps {
		data: ProfileData;
		show_back_button?: boolean;
		enable_follow_ui?: boolean;
		force_owner?: boolean;
	}

	const props: ProfilePageViewProps = $props();

	const is_owner = $derived(props.force_owner ?? props.data.access?.is_owner ?? false);
	const show_back_button = $derived(props.show_back_button ?? false);
	const enable_follow_ui = $derived(props.enable_follow_ui ?? false);

	let is_following_override = $state<boolean | null>(null);
	let followers_count_override = $state<number | null>(null);

	const is_following = $derived(is_following_override ?? (props.data.access?.is_following ?? false));

	let show_avatar_uploader = $state(false);
	let avatar_url = $state<string | null>(null);
	let show_cover_uploader = $state(false);
	let cover_url = $state<string | null>(null);
	let show_connections_modal = $state<'followers' | 'following' | null>(null);

	const profile = $derived(props.data.profile);
	const followers_count = $derived(followers_count_override ?? profile.followers);
	const posts_source = $derived(props.data.posts as ProfilePost[]);
	const reposted_posts_source = $derived(props.data.reposted_posts as ProfilePost[]);
	const liked_posts_source = $derived(props.data.liked_posts as ProfilePost[]);
	const post_overrides = $state<Record<string, ProfilePost>>({});
	const deleted_post_ids = new SvelteSet<string>();

	function apply_local_post_state(
		posts: ProfilePost[],
		include_post?: (post: ProfilePost) => boolean
	): ProfilePost[] {
		return posts
			.filter((p) => !deleted_post_ids.has(p.id))
			.map((p) => post_overrides[p.id] ?? p)
			.filter((p) => (include_post ? include_post(p) : true));
	}

	const local_posts = $derived(apply_local_post_state(posts_source));
	const local_reposted_posts = $derived(
		apply_local_post_state(reposted_posts_source, (post) => (is_owner ? post.user_reposted : true))
	);
	const local_liked_posts = $derived(
		apply_local_post_state(liked_posts_source, (post) => (is_owner ? post.user_liked : true))
	);
	const all_visible_posts = $derived([
		...local_posts,
		...local_reposted_posts,
		...local_liked_posts
	]);

	async function handle_avatar_success(new_url: string) {
		avatar_url = new_url;
		show_avatar_uploader = false;
		await invalidateAll();
	}

	async function handle_cover_success(new_url: string) {
		cover_url = new_url;
		show_cover_uploader = false;
		await invalidateAll();
	}

	function handle_avatar_click() {
		if (!is_owner) {
			return;
		}

		show_avatar_uploader = true;
	}

	function handle_cover_click() {
		if (!is_owner) {
			return;
		}

		show_cover_uploader = true;
	}

	function close_avatar_uploader() {
		show_avatar_uploader = false;
	}

	function close_cover_uploader() {
		show_cover_uploader = false;
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

	async function open_connection_profile(event: MouseEvent, handle: string): Promise<void> {
		event.preventDefault();
		show_connections_modal = null;
		await goto(resolve('/profile/[handle]', { handle }));
	}

	function enhance_follow_form() {
		const was_following = is_following;
		const previous_followers_count = followers_count;

		is_following_override = !was_following;
		followers_count_override = Math.max(0, previous_followers_count + (was_following ? -1 : 1));

		return async ({ result, update }: { result: { type: string; data?: unknown }; update: () => Promise<void> }) => {
			if (result.type === 'success') {
				const data = result.data as { is_following?: boolean; followers_count?: number } | undefined;
				if (typeof data?.is_following === 'boolean') {
					is_following_override = data.is_following;
				}

				if (typeof data?.followers_count === 'number') {
					followers_count_override = data.followers_count;
				}

				return;
			}

			is_following_override = was_following;
			followers_count_override = previous_followers_count;

			await update();
		};
	}

	function handle_metric_change(
		post_id: string,
		type: 'like' | 'dislike' | 'repost',
		new_metrics: ProfilePostMetricChange
	): void {
		const current_post = all_visible_posts.find((p) => p.id === post_id);
		if (!current_post) return;

		const updated_post = {
			...current_post,
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

	function handle_post_delete(post_id: string): void {
		deleted_post_ids.add(post_id);
	}

	function handle_post_edit(
		post_id: string,
		update: { content: string; post_tag: string; post_tags: string[] }
	): void {
		const current_post = all_visible_posts.find((p) => p.id === post_id);
		if (!current_post) return;

		const updated_post = {
			...current_post,
			content: update.content,
			post_tag: update.post_tag,
			post_tags: update.post_tags,
			is_edited: true
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
			{#if is_owner}
				<button class="cover-image-container" onclick={handle_cover_click} aria-label="Change cover photo" type="button">
					<img src={cover_url || profile.cover} alt="Cover" class="cover-image" />
					<div class="cover-overlay">
						<Camera size={32} />
					</div>
				</button>
			{:else}
				<div class="cover-image-container">
					<img src={cover_url || profile.cover} alt="Cover" class="cover-image" />
				</div>
			{/if}

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
						<form method="POST" action="?/toggle_follow" use:enhance={enhance_follow_form}>
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
						<span class="stat-value">{followers_count >= 1000 ? `${(followers_count / 1000).toFixed(1)}K` : followers_count}</span>
						<span class="stat-label">Followers</span>
					</button>
				</div>
			</div>
		</div>

		<ProfilePostTabs
			posts={local_posts}
			reposted_posts={local_reposted_posts}
			liked_posts={local_liked_posts}
			on_metric_change={handle_metric_change}
			on_delete={handle_post_delete}
			on_edit={handle_post_edit}
		/>
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

	{#if is_owner && show_cover_uploader}
		<div
			class="modal-backdrop"
			onclick={close_cover_uploader}
			onkeydown={handle_backdrop_keydown}
			role="button"
			tabindex="0"
			aria-label="Close cover uploader"
		>
			<div
				class="modal-content"
				onclick={stop_event_propagation}
				onkeydown={stop_event_propagation}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<CoverUploader
					current_cover_url={cover_url || profile.cover}
					on_success={handle_cover_success}
					on_close={close_cover_uploader}
				/>
			</div>
		</div>
	{/if}

	<ProfileConnectionsModal
		mode={show_connections_modal}
		followers={props.data.followers}
		following={props.data.following}
		on_item_click={open_connection_profile}
		on_close={() => (show_connections_modal = null)}
	/>
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
		position: relative;
	}

	button.cover-image-container {
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		width: 100%;
	}

	.cover-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.cover-overlay {
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

	button.cover-image-container:hover .cover-overlay {
		opacity: 1;
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
