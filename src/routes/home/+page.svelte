<script lang="ts">
	import { Post, PostTextbox } from '$lib';

	type FeedPost = {
		id: number;
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
			replies?: number;
			reposts?: number;
			likes?: number;
			views?: number;
		};
	};

	const feed_posts: FeedPost[] = [
		{
			id: 1,
			post_tag: 'sport',
			post_tags: ['sport', 'entertainment'],
			posted_at: '4m',
			audience: 'Followers & friends',
			author_name: 'Jordan Rivera',
			author_handle: 'jordanplays',
			content:
				'Welcome to the home feed. This is where fresh posts from your flock will appear in real time.',
			author_bio: 'Weekend runner, football fan and pickup game organizer.',
			verified: true,
			metrics: {
				replies: 21,
				reposts: 9,
				likes: 137,
				views: 1840
			},
			avatar_url: "https://i.pravatar.cc/30"

		},
		{
			id: 2,
			post_tag: 'movie',
			post_tags: ['movie'],
			posted_at: '19m',
			audience: 'Public',
			author_name: 'Sokha Chann',
			author_handle: 'sokha.frames',
			content:
				'Golden hour over the city today. Posting this from the rooftop and the wind is perfect.',
			author_bio: 'Film lover sharing short reviews and cinematography moments.',
			metrics: {
				replies: 7,
				reposts: 12,
				likes: 204,
				views: 3200
			},
			avatar_url: "https://i.pravatar.cc/20"

		},
		{
			id: 3,
			post_tag: 'tech',
			post_tags: ['tech'],
			posted_at: '1h',
			audience: 'Private',
			author_name: 'Vanna Te',
			author_handle: 'vannabuilds',
			content:
				'Hot take: a clean component API now saves hours of refactoring later. Reusability is velocity.',
			author_bio: 'Frontend engineer into DX, performance and product design systems.',
			verified: true,
			metrics: {
				replies: 16,
				reposts: 18,
				likes: 289,
				views: 4500
			},
			avatar_url: "https://i.pravatar.cc/10"

		}
	];

	let next_post_id = $state(feed_posts.length + 1);
	let dynamic_feed_posts = $state<FeedPost[]>(feed_posts);

	function handle_post_submit(payload: {
		content: string;
		audience: string;
		post_tag: string;
		post_tags: string[];
	}): void {
		const created_post: FeedPost = {
			id: next_post_id,
			post_tag: payload.post_tag,
			post_tags: payload.post_tags,
			posted_at: 'now',
			audience: payload.audience,
			content: payload.content,
			author_name: 'You',
			author_handle: 'your.username',
			author_bio: 'Share what is on your mind right now.',
			metrics: {
				replies: 0,
				reposts: 0,
				likes: 0,
				views: 0
			},
		};

		dynamic_feed_posts = [created_post, ...dynamic_feed_posts];

		next_post_id += 1;
	}
</script>

<main class="home-feed-page" aria-label="Home feed page">

	<div class="composer-wrap">
		<PostTextbox on_submit={handle_post_submit} isExpanded={false} />
	</div>

	<section class="feed-column" aria-label="Posts">
		{#each dynamic_feed_posts as post (post.id)}
			<Post
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
			/>
		{/each}
	</section>
</main>

<style>
	.home-feed-page {
		min-height: 100vh;
		width: calc(100% + 3rem);
		margin: -1.5rem;
		background: #f8fbff;

	}

	.feed-column {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem 0 1.25rem;
		box-sizing: border-box;
		/* background: #ffffff; */
	}

	.composer-wrap {
		width: 100%;
		max-width: 980px;
		margin: 0 auto;
		padding: 1rem 1.25rem;
		box-sizing: border-box;
		border-bottom: 1px solid #e2e8f0;
		/* background: #ffffff; */
	}

	@media (max-width: 900px) {
		.home-feed-page {
			width: calc(100% + 2rem);
			margin: -1rem;
		}

		.feed-column {
			padding: 0.85rem 1rem 0 1rem;
		}

		.composer-wrap {
			padding: 1rem;
		}
	}

</style>
