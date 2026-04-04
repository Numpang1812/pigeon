<script lang="ts">
	import { BadgeCheck, Check, Repeat2, Heart, ThumbsDown } from 'lucide-svelte';

	type PostMetrics = {
		likes?: number;
		dislikes?: number;
		reposts?: number;
	};

	interface PostProps {
		post_id: string;
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
		metrics?: PostMetrics;
		user_liked?: boolean;
		user_disliked?: boolean;
		user_reposted?: boolean;
	}

	const props: PostProps = $props();

	const liked = $derived(props.user_liked ?? false);
	const disliked = $derived(props.user_disliked ?? false);
	const reposted = $derived(props.user_reposted ?? false);

	const like_count = $derived(
		(props.metrics?.likes ?? 0) + (liked ? 1 : 0)
	);
	
	const dislike_count = $derived(
		(props.metrics?.dislikes ?? 0) + (disliked ? 1 : 0)
	);
	
	const repost_count = $derived(
		(props.metrics?.reposts ?? 0) + (reposted ? 1 : 0)
	);
	
	const normalized_tags = $derived.by(() => {
		const source_tags = props.post_tags?.length ? props.post_tags : [props.post_tag];
		const normalized = source_tags
			.map((tag) => tag.trim().toLowerCase())
			.filter((tag) => tag.length > 0);
		const unique_tags = Array.from(new Set(normalized));
		return unique_tags.length ? unique_tags : ['general'];
	});

	const tag_themes: Record<string, { bg: string; fg: string; border: string }> = {
		sport: { bg: '#dcfce7', fg: '#166534', border: '#86efac' },
		movie: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
		music: { bg: '#fee2e2', fg: '#9f1239', border: '#fda4af' },
		tech: { bg: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' },
		news: { bg: '#fef3c7', fg: '#92400e', border: '#fcd34d' },
		question: { bg: '#e0f2fe', fg: '#0c4a6e', border: '#7dd3fc' },
		update: { bg: '#ecfccb', fg: '#3f6212', border: '#bef264' }
	};

	function hash_string(value: string): number {
		let hash = 0;
		for (let i = 0; i < value.length; i += 1) {
			hash = (hash << 5) - hash + value.charCodeAt(i);
			hash |= 0;
		}
		return Math.abs(hash);
	}

	function fallback_tag_theme(tag: string): { bg: string; fg: string; border: string } {
		const hash = hash_string(tag);
		const hue = hash % 360;
		return {
			bg: `hsl(${hue} 78% 94%)`,
			fg: `hsl(${hue} 62% 28%)`,
			border: `hsl(${hue} 68% 78%)`
		};
	}

	function get_tag_theme(tag: string): { bg: string; fg: string; border: string } {
		return tag_themes[tag] ?? fallback_tag_theme(tag);
	}

	function compact_count(value = 0): string {
		if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
		return `${value}`;
	}

	async function toggle_like(): Promise<void> {
		try {
			const response = await fetch(`/api/posts/${props.post_id}/like`, {
				method: 'POST'
			});
			
			if (response.ok) {
				const { invalidateAll: invalidate_all } = await import('$app/navigation');
				await invalidate_all();
			}
		} catch (error) {
			console.error('Failed to toggle like:', error);
		}
	}

	async function toggle_dislike(): Promise<void> {
		try {
			const response = await fetch(`/api/posts/${props.post_id}/dislike`, {
				method: 'POST'
			});
			
			if (response.ok) {
				const { invalidateAll: invalidate_all } = await import('$app/navigation');
				await invalidate_all();
			}
		} catch (error) {
			console.error('Failed to toggle dislike:', error);
		}
	}

	async function toggle_repost(): Promise<void> {
		try {
			const response = await fetch(`/api/posts/${props.post_id}/repost`, {
				method: 'POST'
			});
			
			if (response.ok) {
				const { invalidateAll: invalidate_all } = await import('$app/navigation');
				await invalidate_all();
			}
		} catch (error) {
			console.error('Failed to toggle repost:', error);
		}
	}
</script>

<article class="post-shell" aria-label="Feed post">
	<div class="card">
		<section class="content-section">
			<header class="content-header">
				<p class="tag-inline">
					{#each normalized_tags as tag (tag)}
						<span
							class="topic-tag"
							style={`--tag-bg:${get_tag_theme(tag).bg}; --tag-fg:${get_tag_theme(tag).fg}; --tag-border:${get_tag_theme(tag).border};`}
						>
							#{tag}
						</span>
					{/each}
					{#if props.audience}
						<span>{props.audience}</span>
					{/if}
				</p>
				<time class="timestamp">{props.posted_at}</time>
			</header>

			<p class="body-text">{props.content}</p>

			<footer class="metrics">
				<button
					type="button"
					class={`metric action-like ${liked ? 'active' : ''}`}
					onclick={toggle_like}
					aria-pressed={liked}
					aria-label="Toggle like"
				>
					<Heart size={16} fill={liked ? 'currentColor' : 'none'} />
					<span>{compact_count(like_count)}</span>
				</button>

				<button
					type="button"
					class={`metric action-dislike ${disliked ? 'active' : ''}`}
					onclick={toggle_dislike}
					aria-pressed={disliked}
					aria-label="Toggle dislike"
				>
					<ThumbsDown size={16} fill={disliked ? 'currentColor' : 'none'} />
					<span>{compact_count(dislike_count)}</span>
				</button>

				<button
					type="button"
					class={`metric action-repost ${reposted ? 'active' : ''}`}
					onclick={toggle_repost}
					aria-pressed={reposted}
					aria-label="Toggle repost"
				>
					{#if reposted}
						<Repeat2 size={18}>
							<Check size="12" x="6" y="6" />
						</Repeat2>
					{:else}
						<Repeat2 size={16} />
					{/if}
					<span>{compact_count(repost_count)}</span>
				</button>
			</footer>
		</section>

		<aside class="author-section">
			<div class="avatar-wrapper">
				{#if props.avatar_url}
					<img class="avatar-image" src={props.avatar_url} alt={`${props.post_tag} tag icon`} />
				{:else}
					<div class="avatar-placeholder" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
						</svg>
					</div>
				{/if}
			</div>

			<div class="author-info">
				<div class="author-title-row">
					<h2 class="author-name">{props.author_name}</h2>
					{#if props.verified}
						<span class="verified-icon" aria-label="Verified account" title="Verified account">
							<BadgeCheck size={18} aria-hidden="true" fill="#0ea5e9"/>
						</span>
					{/if}
				</div>
				<span class="author-handle">@{props.author_handle}</span>
				{#if props.author_bio}
					<p class="author-bio">{props.author_bio}</p>
				{/if}
			</div>
		</aside>
	</div>
</article>

<style>
	.post-shell {
		width: 100%;
		margin: 0 0 1rem 0;
		box-sizing: border-box;
	}

	.card {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 260px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		overflow: hidden;
	}

	.content-section {
		padding: 1.1rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.95rem;
	}

	.content-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.tag-inline {
		margin: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: #64748b;
	}

	.topic-tag {
		display: inline-flex;
		align-items: center;
		padding: 0.16rem 0.5rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.76rem;
		background: var(--tag-bg);
		color: var(--tag-fg);
		border: 1px solid var(--tag-border);
	}

	.timestamp {
		color: #64748b;
		font-size: 0.82rem;
	}

	.body-text {
		font-size: 1rem;
		line-height: 1.55;
		color: #334155;
		margin: 0;
	}

	.metrics {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.metric {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.35rem 0.6rem;
		border: 1px solid transparent;
		border-radius: 999px;
		background: #f8fafc;
		color: #64748b;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.metric:hover {
		border-color: #cbd5e1;
	}

	.action-like.active {
		color: #dc2626;
		background: #fee2e2;
		border-color: #fecaca;
	}

	.action-dislike.active {
		color: #6b7280;
		background: #f3f4f6;
		border-color: #d1d5db;
	}

	.action-repost.active {
		color: #16a34a;
		background: #dcfce7;
		border-color: #bbf7d0;
	}

	.author-section {
		padding: 1.1rem;
		border-left: 1px solid #e2e8f0;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		background: linear-gradient(#fafeff,#fcfcff);
	}

	.avatar-wrapper {
		flex-shrink: 0;
	}

	.avatar-image,
	.avatar-placeholder {
		width: 56px;
		height: 56px;
		border-radius: 50%;
	}

	.avatar-image {
		display: block;
		object-fit: cover;
	}

	.avatar-placeholder {
		background: #1e293b;
		color: #e2e8f0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-placeholder svg {
		width: 26px;
		height: 26px;
	}

	.author-info {
		min-width: 0;
	}

	.author-title-row {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	.author-name {
		font-size: 0.96rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.verified-icon {
		display: inline-flex;
		align-items: center;
		color: #ffffff;
		flex-shrink: 0;
	}

	.author-handle {
		display: block;
		margin-top: 0.1rem;
		font-size: 0.83rem;
		color: #49afde	}

	.author-bio {
		margin: 0.45rem 0 0 0;
		font-size: 0.78rem;
		line-height: 1.45;
		color: #64748b;
	}

	@media (max-width: 900px) {
		.card {
			grid-template-columns: 1fr;
		}

		.author-section {
			border-left: none;
			border-top: 1px solid #e2e8f0;
		}
	}
</style>