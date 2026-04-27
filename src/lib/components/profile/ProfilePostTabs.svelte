<script lang="ts">
	import { Post } from '$lib';
	import type { ProfilePost, ProfilePostMetricChange } from './types';

	interface ProfilePostTabsProps {
		posts: ProfilePost[];
		reposted_posts: ProfilePost[];
		liked_posts: ProfilePost[];
		on_metric_change: (
			post_id: string,
			type: 'like' | 'dislike' | 'repost',
			new_metrics: ProfilePostMetricChange
		) => void;
		on_delete: (post_id: string) => void;
		on_edit: (
			post_id: string,
			update: { content: string; post_tag: string; post_tags: string[] }
		) => void;
	}

	const props: ProfilePostTabsProps = $props();

	const tabs = ['Posts', 'Repost','Like'] as const;
	let active_tab = $state<(typeof tabs)[number]>('Posts');

	const active_posts = $derived.by(() => {
		if (active_tab === 'Posts') {
			return props.posts;
		}

		if (active_tab === 'Repost') {
			return props.reposted_posts;
		}

		if (active_tab === 'Like') {
			return props.liked_posts;
		}

		return [] as ProfilePost[];
	});
</script>

<nav class="profile-tabs">
	{#each tabs as tab (tab)}
		<button class="tab" class:active={active_tab === tab} onclick={() => (active_tab = tab)}>
			{tab}
			{#if active_tab === tab}
				<div class="tab-indicator"></div>
			{/if}
		</button>
	{/each}
</nav>

<section class="feed-column" id="posts" aria-label="Posts">
	{#if active_tab === 'Media'}
		<div class="empty-state">
			<h2>No media yet</h2>
			<p>When there are media posts, they will show up here.</p>
		</div>
	{:else if active_posts.length > 0}
		{#each active_posts as post (post.id)}
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
				on_metric_change={props.on_metric_change}
				on_delete={props.on_delete}
				on_edit={props.on_edit}
			/>
		{/each}
	{:else}
		<div class="empty-state">
			<h2>No {active_tab.toLowerCase()} yet</h2>
			<p>When there are {active_tab.toLowerCase()}, they will show up here.</p>
		</div>
	{/if}
</section>

<style>
	.profile-tabs {
		display: flex;
		border-bottom: 1px solid #e1e8ed;
		width: 100%;
		background-color: #ffffff;
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
</style>
