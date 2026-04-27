<script lang="ts">
	import Post from './Post.svelte';

	interface PostData {
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
	}

	interface Props {
		post: PostData;
		on_metric_change: (post_id: string, type: 'like' | 'dislike' | 'repost', new_metrics: { likes: number; dislikes: number; reposts: number; user_liked: boolean; user_disliked: boolean; user_reposted: boolean }) => void;
		on_delete: (post_id: string) => void;
		on_edit: (post_id: string, update: { content: string; post_tag: string; post_tags: string[] }) => void;
		on_height_change: (id: string, height: number) => void;
	}

	const { post, on_metric_change, on_delete, on_edit, on_height_change }: Props = $props();

	let element = $state<HTMLElement>();

	$effect(() => {
		if (!element) return;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
				if (height > 0) {
					on_height_change(post.id, height);
				}
			}
		});

		observer.observe(element);
		return () => observer.disconnect();
	});
</script>

<div bind:this={element} class="virtualized-post-wrapper" data-post-id={post.id}>
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
		on_metric_change={on_metric_change}
		on_delete={on_delete}
		on_edit={on_edit}
	/>
</div>

<style>
	.virtualized-post-wrapper {
		width: 100%;
		contain: layout;
	}
</style>
