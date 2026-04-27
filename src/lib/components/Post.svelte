<script lang="ts">
	import { BadgeCheck, Check, Repeat2, Heart, ThumbsDown, Trash2, Pencil, X, AlertTriangle } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { normalize_handle } from '$lib';
	import { limit_post_tags } from '$lib/post-tags';
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
		on_edit?: (
			post_id: string,
			update: { content: string; post_tag: string; post_tags: string[] }
		) => void;
	}

	const props: PostProps = $props();

	const audience_labels: Record<string, string> = {
		public: 'Everyone',
		followers_friends: 'Connections',
		close_friends: 'Inner circle',
		private: 'Just me'
	};

	const audience_label = $derived(props.audience ? audience_labels[props.audience] ?? props.audience : '');

	// Local state for optimistic UI updates - initialize from props
	let local_liked = $state(props.user_liked ?? false);
	let local_disliked = $state(props.user_disliked ?? false);
	let local_reposted = $state(props.user_reposted ?? false);
	let local_like_count = $state(props.metrics?.likes ?? 0);
	let local_dislike_count = $state(props.metrics?.dislikes ?? 0);
	let local_repost_count = $state(props.metrics?.reposts ?? 0);

	const liked = $derived(local_liked);
	const disliked = $derived(local_disliked);
	const reposted = $derived(local_reposted);

	const author_handle_safe = $derived.by(() => {
		return normalize_handle(props.author_handle);
	});

	const author_profile_path = $derived.by(
		() => `/profile/${encodeURIComponent(author_handle_safe || 'user')}` as `/profile/${string}`
	);

	type ContentSegment =
		| { type: 'text'; value: string }
		| { type: 'mention'; value: string; profile_path: `/profile/${string}` }
		| { type: 'url'; value: string; href: string };

	function normalize_external_url(url: string): string {
		if (/^https?:\/\//i.test(url)) {
			return url;
		}

		return `https://${url}`;
	}

	function split_trailing_url_punctuation(raw_url: string): { url: string; trailing: string } {
		let end_index = raw_url.length;

		while (end_index > 0 && /[.,!?;:)\]]/.test(raw_url[end_index - 1])) {
			end_index -= 1;
		}

		return {
			url: raw_url.slice(0, end_index),
			trailing: raw_url.slice(end_index)
		};
	}

	let pending_external_href = $state('');
	let show_external_link_confirm = $state(false);

	function request_external_link_open(href: string): void {
		pending_external_href = href;
		show_external_link_confirm = true;
	}

	function cancel_external_link_open(): void {
		show_external_link_confirm = false;
		pending_external_href = '';
	}

	function confirm_external_link_open(): void {
		if (!pending_external_href) {
			show_external_link_confirm = false;
			return;
		}

		window.open(pending_external_href, '_blank', 'noopener,noreferrer');
		show_external_link_confirm = false;
		pending_external_href = '';
	}

	function parse_content_segments(content: string): ContentSegment[] {
		const segments: ContentSegment[] = [];
		const token_pattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+)|@([a-zA-Z0-9_]{2,24})/g;
		let cursor = 0;

		for (const match of content.matchAll(token_pattern)) {
			const full_match = match[0];
			const matched_url = match[1];
			const mention_handle = match[2];
			const match_index = match.index ?? -1;

			if (match_index < 0) {
				continue;
			}

			if (matched_url) {
				if (match_index > cursor) {
					segments.push({
						type: 'text',
						value: content.slice(cursor, match_index)
					});
				}

				const { url: clean_url, trailing } = split_trailing_url_punctuation(matched_url);

				if (clean_url) {
					segments.push({
						type: 'url',
						value: clean_url,
						href: normalize_external_url(clean_url)
					});
				}

				if (trailing) {
					segments.push({
						type: 'text',
						value: trailing
					});
				}

				cursor = match_index + full_match.length;
				continue;
			}

			if (!mention_handle) {
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

	const normalized_content = $derived.by(() =>
		props.content.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n')
	);

	const content_segments = $derived.by(() => parse_content_segments(normalized_content));

	// Metrics come from the API already accurate, just use them directly
	const like_count = $derived(local_like_count);
	const dislike_count = $derived(local_dislike_count);
	const repost_count = $derived(local_repost_count);
	
	const display_tags = $derived.by(() => {
		const source = props.post_tags?.length ? props.post_tags : [props.post_tag];
		const limited = limit_post_tags(source);
		return limited.length ? limited : ['general'];
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
			bg: `hsl(${hue}, 78%, 94%)`,
			fg: `hsl(${hue}, 62%, 28%)`,
			border: `hsl(${hue}, 68%, 78%)`
		};
	}

	function get_tag_theme(tag: string): { bg: string; fg: string; border: string } {
		return tag_themes[tag] ?? fallback_tag_theme(tag);
	}

	function compact_count(value = 0): string {
		if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
		return `${value}`;
	}

	function toggle_like(): void {
		// Optimistic update - modify local state immediately
		const prev_liked = local_liked;
		const prev_disliked = local_disliked;
		const prev_like_count = local_like_count;
		const prev_dislike_count = local_dislike_count;
		const prev_repost_count = local_repost_count;
		const prev_reposted = local_reposted;

		// Update local state immediately
		local_liked = !prev_liked;
		local_disliked = false;
		local_like_count = prev_liked ? prev_like_count - 1 : prev_like_count + 1;
		local_dislike_count = prev_disliked ? prev_dislike_count - 1 : prev_dislike_count;

		// Notify parent to update its state
		props.on_metric_change?.(props.post_id, 'like', {
			likes: local_like_count,
			dislikes: local_dislike_count,
			reposts: prev_repost_count,
			user_liked: local_liked,
			user_disliked: local_disliked,
			user_reposted: prev_reposted
		});

		// Fire-and-forget API request
		fetch(`/api/posts/${props.post_id}/like`, { method: 'POST' }).catch((error) => {
			console.error('Failed to toggle like:', error);
		});
	}

	function toggle_dislike(): void {
		// Optimistic update - modify local state immediately
		const prev_liked = local_liked;
		const prev_disliked = local_disliked;
		const prev_like_count = local_like_count;
		const prev_dislike_count = local_dislike_count;
		const prev_repost_count = local_repost_count;
		const prev_reposted = local_reposted;

		// Update local state immediately
		local_liked = false;
		local_disliked = !prev_disliked;
		local_like_count = prev_liked ? prev_like_count - 1 : prev_like_count;
		local_dislike_count = prev_disliked ? prev_dislike_count - 1 : prev_dislike_count + 1;

		// Notify parent to update its state
		props.on_metric_change?.(props.post_id, 'dislike', {
			likes: local_like_count,
			dislikes: local_dislike_count,
			reposts: prev_repost_count,
			user_liked: local_liked,
			user_disliked: local_disliked,
			user_reposted: prev_reposted
		});

		// Fire-and-forget API request
		fetch(`/api/posts/${props.post_id}/dislike`, { method: 'POST' }).catch((error) => {
			console.error('Failed to toggle dislike:', error);
		});
	}

	function toggle_repost(): void {
		// Optimistic update - modify local state immediately
		const prev_liked = local_liked;
		const prev_disliked = local_disliked;
		const prev_like_count = local_like_count;
		const prev_dislike_count = local_dislike_count;
		const prev_repost_count = local_repost_count;
		const prev_reposted = local_reposted;

		// Update local state immediately
		local_reposted = !prev_reposted;
		local_repost_count = prev_reposted ? prev_repost_count - 1 : prev_repost_count + 1;

		// Notify parent to update its state
		props.on_metric_change?.(props.post_id, 'repost', {
			likes: prev_like_count,
			dislikes: prev_dislike_count,
			reposts: local_repost_count,
			user_liked: prev_liked,
			user_disliked: prev_disliked,
			user_reposted: local_reposted
		});

		// Fire-and-forget API request
		fetch(`/api/posts/${props.post_id}/repost`, { method: 'POST' }).catch((error) => {
			console.error('Failed to toggle repost:', error);
		});
	}

	let is_editing = $state(false);
	let edited_content = $state('');
	let initial_edit_content = $state('');
	let is_saving = $state(false);
	let show_delete_confirm = $state(false);
	let is_deleting = $state(false);
	let is_content_expanded = $state(false);

	const collapsed_content_max_chars = 320;
	const collapsed_content_max_lines = 6;

	const should_show_content_toggle = $derived.by(() => {
		const line_count = normalized_content.split('\n').length;
		return (
			normalized_content.length > collapsed_content_max_chars ||
			line_count > collapsed_content_max_lines
		);
	});

	const is_content_collapsed = $derived(should_show_content_toggle && !is_content_expanded);

	function normalize_post_content(raw_content: string): string {
		return raw_content.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
	}

	function canonical_edit_content(raw_content: string): string {
		return normalize_post_content(raw_content).trim();
	}


	let original_tags: string[] = [];
	let editable_tags = $state<string[]>([]);

	function tags_equal(a: string[], b: string[]): boolean {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	const has_edit_changes = $derived(
		canonical_edit_content(edited_content) !== canonical_edit_content(initial_edit_content)
		|| !tags_equal(editable_tags, original_tags)
	);

	const can_save_edit = $derived(
		!is_saving && has_edit_changes && canonical_edit_content(edited_content).length > 0
	);

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
	edited_content = canonical_edit_content(props.content);

	original_tags = props.post_tags?.length
		? [...props.post_tags]
		: [props.post_tag];

	editable_tags = [...original_tags];

	initial_edit_content = edited_content;
	is_editing = true;
}

	function remove_tag(tag: string) {
		editable_tags = editable_tags.filter((t) => t !== tag);
	}

	function toggle_content_expansion(): void {
		is_content_expanded = !is_content_expanded;
	}

	function cancel_edit() {
		is_editing = false;
	}

	import { extract_post_tags, max_post_tags } from '$lib/post-tags';

	function handle_edit_input(event: Event): void {
		const textarea = event.target as HTMLTextAreaElement;
		const cursor_pos = textarea.selectionStart;
		const normalized = normalize_post_content(edited_content);
		if (normalized !== edited_content) {
			const length_diff = edited_content.length - normalized.length;
			edited_content = normalized;
			requestAnimationFrame(() => {
				textarea.selectionStart = textarea.selectionEnd = Math.max(0, cursor_pos - length_diff);
			});
		}
		// Always derive tags from content, like PostTextbox
		const detected = extract_post_tags(normalized);

		const merged = Array.from(new Set([
			...original_tags,
			...detected
		])).slice(0, max_post_tags);

		editable_tags = merged;
	}
	async function save_edit() {
        if (!has_edit_changes) {
            is_editing = false;
            return;
        }

        const final_content = canonical_edit_content(edited_content);

        if (final_content.length === 0) {
            alert('Content cannot be empty');
            return;
        }

        is_saving = true;

        try {
            const final_tags = editable_tags.length > 0 ? editable_tags : ['general'];

            const response = await fetch(`/api/posts/${props.post_id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: final_content,
                    post_tags: final_tags,
                    post_tag: final_tags[0] // Set the primary tag as the first in the list
                })
            });

            if (response.ok) {
                const data = await response.json();

                // Update the parent component state
                props.on_edit?.(props.post_id, {
                    content: data.content,
                    post_tag: data.post_tag,
                    post_tags: data.post_tags
                });

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
					{#each (is_editing ? editable_tags : display_tags) as tag (tag)}
						<span
							class="topic-tag"
							style={`--tag-bg:${get_tag_theme(tag).bg}; --tag-fg:${get_tag_theme(tag).fg}; --tag-border:${get_tag_theme(tag).border};`}
						>
							#{tag}

							{#if is_editing}
								<button
									type="button"
									class="tag-remove"
									onclick={() => remove_tag(tag)}
								>
									×
								</button>
							{/if}
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
						oninput={handle_edit_input}
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
							disabled={!can_save_edit}
						>
							<Check size={16} />
							<span>{is_saving ? 'Saving...' : 'Save'}</span>
						</button>
					</div>
				</div>
			{:else}
				<div class="body-content-wrap">
					<p class={`body-text ${is_content_collapsed ? 'collapsed' : ''}`}>
						{#each content_segments as segment, index (`${segment.type}-${index}-${segment.value}`)}
							{#if segment.type === 'mention'}
								<a class="mention-link" href={resolve(segment.profile_path)}>{segment.value}</a>
							{:else if segment.type === 'url'}
								<button
									type="button"
									class="external-link"
									title={`Open ${segment.href}`}
									onclick={() => request_external_link_open(segment.href)}
								>{segment.value}</button>
							{:else}
								{segment.value}
							{/if}
						{/each}
					</p>
					{#if show_external_link_confirm}
						<div class="external-link-confirm" transition:fly={{ y: 10, duration: 180 }}>
							<div class="external-link-confirm-message">
								<AlertTriangle size={18} class="warn-icon" />
								<div>
									<p>Open this external link?</p>
									<small>{pending_external_href}</small>
								</div>
							</div>
							<div class="external-link-confirm-actions">
								<button class="confirm-cancel" type="button" onclick={cancel_external_link_open}>Cancel</button>
								<button class="open-link-btn" type="button" onclick={confirm_external_link_open}>Open link</button>
							</div>
						</div>
					{/if}
				</div>
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

				{#if should_show_content_toggle}
					<button
						type="button"
						class="content-toggle-btn"
						onclick={toggle_content_expansion}
					>
						{is_content_expanded ? 'View less' : 'View more'}
					</button>
				{/if}
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
						<div class="avatar-placeholder" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
							</svg>
						</div>
					{/if}
				</a>
			{:else}
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
							<BadgeCheck size={18} aria-hidden="true" fill="#0ea5e9"/>
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
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.tag-inline {
		margin: 0;
		display: flex;
		flex: 1 1 auto;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.9rem;
		color: #64748b;
	}

	.edit-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	.tag-remove {
		margin-left: 6px;
		border: none;
		background: transparent;
		cursor: pointer;
		font-weight: 700;
		color: inherit;
		opacity: 0.7;
	}

	.tag-remove:hover {
		opacity: 1;
	}

	.topic-tag {
		display: inline-flex;
		max-width: 100%;
		min-width: 0;
		align-items: center;
		padding: 0.16rem 0.5rem;
		border-radius: 999px;
		font-weight: 700;
		font-size: 0.76rem;
		background: var(--tag-bg);
		color: var(--tag-fg);
		border: 1px solid var(--tag-border);
		overflow-wrap: anywhere;
		word-break: break-word;
		white-space: normal;
	}

	.timestamp {
		color: #64748b;
		font-size: 0.82rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
		padding-top: 0.1rem;
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
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
		position: relative;
	}

	.body-content-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		position: relative;
	}

	.body-text.collapsed {
		max-height: calc(1.55em * 6);
		overflow: hidden;
	}

	.body-text.collapsed::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2.4rem;
		background: linear-gradient(
			to top,
			rgba(255, 255, 255, 0.98) 0%,
			rgba(255, 255, 255, 0.88) 40%,
			rgba(255, 255, 255, 0) 100%
		);
		border-bottom: 1px solid rgba(14, 165, 233, 0.38);
		box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.92) inset;
		pointer-events: none;
	}

	.content-toggle-btn {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		padding: 0.05rem 0;
		border: none;
		background: transparent;
		color: #0ea5e9;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		cursor: pointer;
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, #0ea5e9 52%, transparent);
		text-underline-offset: 0.2em;
		transition: color 150ms ease, text-decoration-color 150ms ease;
	}

	.content-toggle-btn:hover {
		color: #0284c7;
		text-decoration-color: currentColor;
	}

	.content-toggle-btn:focus-visible {
		outline: 2px solid #38bdf8;
		outline-offset: 2px;
		border-radius: 4px;
	}

	.mention-link {
		color: #0284c7;
		font-weight: 700;
		text-decoration: none;
	}

	.mention-link:hover {
		text-decoration: underline;
	}

	.external-link {
		display: inline;
		padding: 0;
		border: none;
		background: transparent;
		color: #0284c7;
		font-weight: 500;
		font-size: inherit;
		font-family: inherit;
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, #0369a1 45%, transparent);
		text-underline-offset: 0.14em;
		cursor: pointer;
	}

	.external-link:hover {
		color: #0c4a6e;
		text-decoration-color: currentColor;
	}

	.external-link-confirm {
		display: grid;
		gap: 0.85rem;
		padding: 1rem;
		margin-top: 0.5rem;
		border-radius: 10px;
		border: 1px solid #cbd5e1;
		background: linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%);
		box-shadow: 0 10px 24px rgba(14, 116, 144, 0.08);
	}

	.external-link-confirm-message {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.external-link-confirm-message p {
		margin: 0;
		font-size: 0.92rem;
		font-weight: 600;
		color: #0f172a;
	}

	.external-link-confirm-message small {
		display: block;
		margin-top: 0.2rem;
		font-size: 0.78rem;
		line-height: 1.35;
		color: #475569;
		overflow-wrap: anywhere;
		word-break: break-word;
	}

	.external-link-confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.open-link-btn {
		border-radius: 8px;
		padding: 0.55rem 0.75rem;
		font-size: 0.85rem;
		font-weight: 700;
		cursor: pointer;
		color: #ffffff;
		background: #0284c7;
		border: 1px solid #0369a1;
		transition: all 180ms ease;
	}

	.open-link-btn:hover {
		background: #0369a1;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(3, 105, 161, 0.2);
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
