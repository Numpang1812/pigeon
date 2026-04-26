<script lang="ts">
	import { BadgeCheck, Check, Repeat2, Heart, ThumbsDown, Trash2, Pencil, X, AlertTriangle } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { normalize_handle } from '$lib';
	import { fly } from 'svelte/transition';

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
		is_author?: boolean;
		is_edited?: boolean;
		on_metric_change?: (post_id: string, type: 'like' | 'dislike' | 'repost', new_metrics: {
			likes: number;
			dislikes: number;
			reposts: number;
			user_liked: boolean;
			user_disliked: boolean;
			user_reposted: boolean;
		}) => void;
		on_delete?: (post_id: string) => void;
		on_edit?: (post_id: string, new_content: string) => void;
	}

	const props: PostProps = $props();

	const audience_labels: Record<string, string> = {
		public: 'Everyone',
		followers_friends: 'Connections',
		close_friends: 'Inner circle',
		private: 'Just me'
	};

	const audience_label = $derived(props.audience ? audience_labels[props.audience] ?? props.audience : '');

	const liked = $derived(props.user_liked ?? false);
	const disliked = $derived(props.user_disliked ?? false);
	const reposted = $derived(props.user_reposted ?? false);
	const author_handle_safe = $derived.by(() => {
		return normalize_handle(props.author_handle);
	});

	const author_profile_path = $derived.by(
		() => `/profile/${encodeURIComponent(author_handle_safe || 'user')}` as `/profile/${string}`
	);

	type ContentSegment =
		| { type: 'text'; value: string }
		| { type: 'mention'; value: string; profile_path: `/profile/${string}` };

	function parse_content_segments(content: string): ContentSegment[] {
		const segments: ContentSegment[] = [];
		const mention_pattern = /@([a-zA-Z0-9_]{2,24})/g;
		let cursor = 0;

		for (const match of content.matchAll(mention_pattern)) {
			const full_match = match[0];
			const mention_handle = match[1];
			const match_index = match.index ?? -1;

			if (match_index < 0) {
				continue;
			}

			const prev_char = match_index > 0 ? content[match_index - 1] : '';
			const is_word_char_before = /[a-zA-Z0-9_.]/.test(prev_char);
			if (is_word_char_before) {
				continue;
			}

			if (match_index > cursor) {
				segments.push({
					type: 'text',
					value: content.slice(cursor, match_index)
				});
			}

			const normalized_mention = normalize_handle(mention_handle);
			if (normalized_mention) {
				segments.push({
					type: 'mention',
					value: full_match,
					profile_path: `/profile/${encodeURIComponent(normalized_mention)}` as `/profile/${string}`
				});
			} else {
				segments.push({
					type: 'text',
					value: full_match
				});
			}

			cursor = match_index + full_match.length;
		}

		if (cursor < content.length) {
			segments.push({
				type: 'text',
				value: content.slice(cursor)
			});
		}

		if (segments.length === 0) {
			segments.push({
				type: 'text',
				value: content
			});
		}

		return segments;
	}

	const content_segments = $derived.by(() => parse_content_segments(props.content));

	// Metrics come from the API already accurate, just use them directly
	const like_count = $derived(props.metrics?.likes ?? 0);
	const dislike_count = $derived(props.metrics?.dislikes ?? 0);
	const repost_count = $derived(props.metrics?.reposts ?? 0);
	
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
		if (!props.on_metric_change) return;

		const original_metrics = {
			likes: like_count,
			dislikes: dislike_count,
			reposts: repost_count,
			user_liked: liked,
			user_disliked: disliked,
			user_reposted: reposted
		};

		const is_liking = !liked;

		// Optimistic update
		props.on_metric_change(props.post_id, 'like', {
			likes: is_liking ? like_count + 1 : like_count - 1,
			dislikes: is_liking && disliked ? dislike_count - 1 : dislike_count,
			reposts: repost_count,
			user_liked: is_liking,
			user_disliked: is_liking ? false : disliked,
			user_reposted: reposted
		});

		try {
			const response = await fetch(`/api/posts/${props.post_id}/like`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				props.on_metric_change(props.post_id, 'like', {
					likes: data.like_count,
					dislikes: data.dislike_count,
					reposts: data.repost_count,
					user_liked: data.user_liked,
					user_disliked: data.user_disliked,
					user_reposted: data.user_reposted
				});
			} else {
				props.on_metric_change(props.post_id, 'like', original_metrics);
			}
		} catch (error) {
			console.error('Failed to toggle like:', error);
			props.on_metric_change(props.post_id, 'like', original_metrics);
		}
	}

	async function toggle_dislike(): Promise<void> {
		if (!props.on_metric_change) return;

		const original_metrics = {
			likes: like_count,
			dislikes: dislike_count,
			reposts: repost_count,
			user_liked: liked,
			user_disliked: disliked,
			user_reposted: reposted
		};

		const is_disliking = !disliked;

		// Optimistic update
		props.on_metric_change(props.post_id, 'dislike', {
			likes: is_disliking && liked ? like_count - 1 : like_count,
			dislikes: is_disliking ? dislike_count + 1 : dislike_count - 1,
			reposts: repost_count,
			user_liked: is_disliking ? false : liked,
			user_disliked: is_disliking,
			user_reposted: reposted
		});

		try {
			const response = await fetch(`/api/posts/${props.post_id}/dislike`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				props.on_metric_change(props.post_id, 'dislike', {
					likes: data.like_count,
					dislikes: data.dislike_count,
					reposts: data.repost_count,
					user_liked: data.user_liked,
					user_disliked: data.user_disliked,
					user_reposted: data.user_reposted
				});
			} else {
				props.on_metric_change(props.post_id, 'dislike', original_metrics);
			}
		} catch (error) {
			console.error('Failed to toggle dislike:', error);
			props.on_metric_change(props.post_id, 'dislike', original_metrics);
		}
	}

	async function toggle_repost(): Promise<void> {
		if (!props.on_metric_change) return;

		const original_metrics = {
			likes: like_count,
			dislikes: dislike_count,
			reposts: repost_count,
			user_liked: liked,
			user_disliked: disliked,
			user_reposted: reposted
		};

		const is_reposting = !reposted;

		// Optimistic update
		props.on_metric_change(props.post_id, 'repost', {
			likes: like_count,
			dislikes: dislike_count,
			reposts: is_reposting ? repost_count + 1 : repost_count - 1,
			user_liked: liked,
			user_disliked: disliked,
			user_reposted: is_reposting
		});

		try {
			const response = await fetch(`/api/posts/${props.post_id}/repost`, {
				method: 'POST'
			});

			if (response.ok) {
				const data = await response.json();
				props.on_metric_change(props.post_id, 'repost', {
					likes: data.like_count,
					dislikes: data.dislike_count,
					reposts: data.repost_count,
					user_liked: data.user_liked,
					user_disliked: data.user_disliked,
					user_reposted: data.user_reposted
				});
			} else {
				props.on_metric_change(props.post_id, 'repost', original_metrics);
			}
		} catch (error) {
			console.error('Failed to toggle repost:', error);
			props.on_metric_change(props.post_id, 'repost', original_metrics);
		}
	}

	let is_editing = $state(false);
	let edited_content = $state('');
	let is_saving = $state(false);
	let show_delete_confirm = $state(false);
	let is_deleting = $state(false);

	$effect(() => {
		if (!is_editing) {
			edited_content = props.content;
		}
	});

	function request_delete() {
		show_delete_confirm = true;
	}

	function cancel_delete() {
		show_delete_confirm = false;
	}

	async function handle_delete() {
		is_deleting = true;

		try {
			const response = await fetch(`/api/posts/${props.post_id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				props.on_delete?.(props.post_id);
			} else {
				const data = await response.json();
				alert(data.error || 'Failed to delete post');
			}
		} catch (error) {
			console.error('Failed to delete post:', error);
			alert('Failed to delete post');
		} finally {
			is_deleting = false;
		}
	}

	function start_edit() {
		edited_content = props.content;
		is_editing = true;
	}

	function cancel_edit() {
		is_editing = false;
	}

	async function save_edit() {
		if (edited_content.trim() === props.content) {
			is_editing = false;
			return;
		}

		if (edited_content.trim().length === 0) {
			alert('Content cannot be empty');
			return;
		}

		is_saving = true;
		try {
			const response = await fetch(`/api/posts/${props.post_id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: edited_content })
			});

			if (response.ok) {
				const data = await response.json();
				props.on_edit?.(props.post_id, data.content);
				is_editing = false;
			} else {
				const data = await response.json();
				alert(data.error || 'Failed to update post');
			}
		} catch (error) {
			console.error('Failed to update post:', error);
			alert('Failed to update post');
		} finally {
			is_saving = false;
		}
	}
</script>

<article
	id={`post-${props.post_id}`}
	class="post-shell"
	aria-label="Feed post"
>
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
					{#if audience_label}
						<span>{audience_label}</span>
					{/if}
				</p>
				<time class="timestamp">
					{props.posted_at}
					{#if props.is_edited}
						<span class="edited-label" title="This post has been modified">· Edited</span>
					{/if}
				</time>
				{#if props.is_author && !is_editing}
					<div class="author-actions">
						<button 
							type="button" 
							class="action-btn edit-btn" 
							onclick={start_edit}
							aria-label="Edit post"
						>
							<Pencil size={14} />
						</button>
						<button 
							type="button" 
							class="action-btn delete-btn" 
							onclick={request_delete}
							aria-label="Delete post"
						>
							<Trash2 size={14} />
						</button>
					</div>
				{/if}
			</header>

			{#if show_delete_confirm}
				<div class="delete-confirm" transition:fly={{ y: 10, duration: 180 }}>
					<div class="confirm-message">
						<AlertTriangle size={18} class="warn-icon" />
						<p>Delete this post permanently?</p>
					</div>
					<div class="confirm-actions">
						<button class="confirm-cancel" type="button" onclick={cancel_delete}>Cancel</button>
						<button
							class="confirm-delete-btn"
							type="button"
							onclick={handle_delete}
							disabled={is_deleting}
						>
							{is_deleting ? 'Deleting...' : 'Yes, delete'}
						</button>
					</div>
				</div>
			{:else if is_editing}
				<div class="edit-mode">
					<textarea
						class="edit-textarea"
						bind:value={edited_content}
						maxlength="280"
						disabled={is_saving}
					></textarea>
					<div class="edit-actions">
						<button
							type="button"
							class="edit-action-btn cancel-btn"
							onclick={cancel_edit}
							disabled={is_saving}
						>
							<X size={16} />
							<span>Cancel</span>
						</button>
						<button
							type="button"
							class="edit-action-btn save-btn"
							onclick={save_edit}
							disabled={is_saving || edited_content.trim() === ''}
						>
							<Check size={16} />
							<span>{is_saving ? 'Saving...' : 'Save'}</span>
						</button>
					</div>
				</div>
			{:else}
				<p class="body-text">
					{#each content_segments as segment, index (`${segment.type}-${index}-${segment.value}`)}
						{#if segment.type === 'mention'}
							<a class="mention-link" href={resolve(segment.profile_path)}>{segment.value}</a>
						{:else}
							{segment.value}
						{/if}
					{/each}
				</p>
			{/if}

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
			{#if author_handle_safe}
				<a
					class="avatar-wrapper author-link"
					href={resolve(author_profile_path)}
					aria-label={`View @${props.author_handle} profile`}
				>
					{#if props.avatar_url}
						<img class="avatar-image" src={props.avatar_url} alt={`${props.post_tag} tag icon`} />
					{:else}
						<img class="avatar-image" src="/default-avatar.svg" alt={`${props.author_name} default avatar`} />
					{/if}
				</a>
			{:else}
				<div class="avatar-wrapper">
					{#if props.avatar_url}
						<img class="avatar-image" src={props.avatar_url} alt={`${props.post_tag} tag icon`} />
					{:else}
						<img class="avatar-image" src="/default-avatar.svg" alt={`${props.author_name} default avatar`} />
					{/if}
				</div>
			{/if}

			<div class="author-info">
				<div class="author-title-row">
					<h2 class="author-name">
						{#if author_handle_safe}
							<a class="author-link" href={resolve(author_profile_path)}>{props.author_name}</a>
						{:else}
							{props.author_name}
						{/if}
					</h2>
					{#if props.verified}
						<span class="verified-icon" aria-label="Verified account" title="Verified account">
							<BadgeCheck size={18} aria-hidden="true" fill="#0ea5e9" color="white" />
						</span>
					{/if}
				</div>
				{#if author_handle_safe}
					<a class="author-handle author-link" href={resolve(author_profile_path)}>@{props.author_handle}</a>
				{:else}
					<span class="author-handle">@{props.author_handle}</span>
				{/if}
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
		transition: transform 170ms ease;
	}

	.post-shell:hover {
		transform: translateY(-2px);
	}

	:global(.post-shell.flash-target) .card {
		border-color: #38bdf8;
		box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18), 0 14px 30px -18px rgba(14, 165, 233, 0.7);
		animation: post-pop-in 680ms cubic-bezier(0.2, 0.9, 0.2, 1);
	}

	@keyframes post-pop-in {
		0% {
			transform: translateY(12px) scale(0.985);
			opacity: 0.5;
		}
		60% {
			transform: translateY(-3px) scale(1.01);
			opacity: 1;
		}
		100% {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
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
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.edited-label {
		font-size: 0.72rem;
		opacity: 0.7;
		font-weight: 500;
	}

	.body-text {
		font-size: 1rem;
		line-height: 1.55;
		color: #334155;
		margin: 0;
	}

	.mention-link {
		color: #0284c7;
		font-weight: 700;
		text-decoration: none;
	}

	.mention-link:hover {
		text-decoration: underline;
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

	.author-link {
		color: inherit;
		text-decoration: none;
	}

	.author-link:hover {
		text-decoration: underline;
	}

	.avatar-wrapper.author-link:hover {
		text-decoration: none;
	}

	.avatar-wrapper.author-link:focus-visible,
	.author-info .author-link:focus-visible {
		outline: 2px solid #38bdf8;
		outline-offset: 2px;
		border-radius: 8px;
	}

	.avatar-image {
		width: 56px;
		height: 56px;
		border-radius: 50%;
	}

	.avatar-image {
		display: block;
		object-fit: cover;
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

	.author-actions {
		display: flex;
		gap: 0.4rem;
		margin-left: auto;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid transparent;
		background: transparent;
		color: #94a3b8;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.action-btn:hover {
		background: #f1f5f9;
		color: #64748b;
		border-color: #e2e8f0;
	}

	.delete-btn:hover {
		background: #fef2f2;
		color: #ef4444;
		border-color: #fee2e2;
	}

	.delete-confirm {
		display: grid;
		gap: 0.85rem;
		padding: 1rem;
		margin: 0.5rem 0;
		border-radius: 10px;
		border: 1px solid #fee2e2;
		background: linear-gradient(135deg, #fffcfc 0%, #fff5f5 100%);
		box-shadow: 0 10px 24px rgba(239, 68, 68, 0.08);
	}

	.confirm-message {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.warn-icon {
		color: #ef4444;
	}

	.delete-confirm p {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		color: #991b1b;
	}

	.confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.confirm-cancel,
	.confirm-delete-btn {
		border-radius: 8px;
		padding: 0.55rem 0.75rem;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 180ms ease;
	}

	.confirm-cancel {
		color: #64748b;
		background: white;
		border: 1px solid #e2e8f0;
	}

	.confirm-cancel:hover {
		background: #f8fafc;
		border-color: #cbd5e1;
	}

	.confirm-delete-btn {
		color: #ffffff;
		background: #ef4444;
		border: 1px solid #dc2626;
	}

	.confirm-delete-btn:hover:not(:disabled) {
		background: #dc2626;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
	}

	.confirm-delete-btn:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	.edit-mode {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
	}

	.edit-textarea {
		width: 100%;
		min-height: 100px;
		padding: 0.75rem;
		border-radius: 8px;
		border: 1px solid #cbd5e1;
		font-family: inherit;
		font-size: 1rem;
		line-height: 1.55;
		resize: vertical;
		outline: none;
		transition: border-color 150ms ease;
	}

	.edit-textarea:focus {
		border-color: #38bdf8;
		box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
	}

	.edit-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 150ms ease;
	}

	.cancel-btn {
		background: #f8fafc;
		border: 1px solid #e2e8f0;
		color: #64748b;
	}

	.cancel-btn:hover {
		background: #f1f5f9;
		border-color: #cbd5e1;
	}

	.save-btn {
		background: #0ea5e9;
		border: 1px solid #0284c7;
		color: white;
	}

	.save-btn:hover:not(:disabled) {
		background: #0284c7;
		box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
	}

	.save-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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