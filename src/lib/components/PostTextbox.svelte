<script lang="ts">
	import {
		Check,
		ChevronDown,
		Globe,
		Lock,
		SendHorizontal,
		ShieldCheck,
		Users
	} from 'lucide-svelte';
	import { tick } from 'svelte';

	interface PostTextboxProps {
		placeholder?: string;
		button_label?: string;
		isExpanded?: boolean;
		on_submit?: (payload: {
			content: string;
			audience: string;
			post_tag: string;
			post_tags: string[];
			allowed_user_ids: string[];
		}) => void;
	}

	const props: PostTextboxProps = $props();

	type AudienceOption = {
		value: string;
		label: string;
		hint: string;
		icon: typeof Globe;
	};

	const audience_options: AudienceOption[] = [
		{
			value: 'public',
			label: 'Everyone',
			hint: 'Visible to all users',
			icon: Globe
		},
		{
			value: 'followers_friends',
			label: 'Connections',
			hint: 'Followers and Following only',
			icon: Users
		},
		{
			value: 'close_friends',
			label: 'Inner circle',
			hint: 'Only your close friends',
			icon: ShieldCheck
		},
		{
			value: 'private',
			label: 'Just me',
			hint: 'Private post',
			icon: Lock
		}
	];

	let text_content = $state('');
	let selected_audience = $state<string>(audience_options[0].value);
	let is_audience_menu_open = $state(false);
	let is_submitting = $state(false);
	let mention_results = $state<{ id: string; name: string; username: string; image: string | null }[]>([]);
	let is_mention_menu_open = $state(false);
	let is_mention_loading = $state(false);
	let is_close_friend_loading = $state(false);
	let active_mention_index = $state(0);
	let mention_timer: ReturnType<typeof setTimeout>;
	let mention_request_id = 0;
	let close_friend_request_id = 0;
	let textarea_element = $state<HTMLTextAreaElement | null>(null);
	let mention_context = $state<{ start: number; end: number } | null>(null);
	let close_friend_candidates = $state<{ id: string; name: string; handle: string; avatar: string }[]>([]);
	let selected_close_friend_ids = $state<string[]>([]);
	let is_close_friend_list_collapsed = $state(false);
	const hashtag_pattern = /(^|[^a-z0-9_])#([a-z0-9_]{2,24})\b/gi;
	const sanitized_text_content = $derived.by(() =>
		text_content
			.replace(hashtag_pattern, '$1')
			.replace(/\s{2,}/g, ' ')
			.replace(/\s+([.,!?;:])/g, '$1')
			.trim()
	);
	const can_submit = $derived(
		sanitized_text_content.length > 0 &&
		!is_submitting &&
		(selected_audience !== 'close_friends' || selected_close_friend_ids.length > 0)
	);
	const selected_audience_option = $derived(
		audience_options.find((option) => option.value === selected_audience) ?? audience_options[0]
	);
	const detected_hashtags = $derived.by(() => {
		const matches = text_content.matchAll(hashtag_pattern);
		const tags = Array.from(matches, (match) => match[2].toLowerCase());
		return Array.from(new Set(tags)).slice(0, 6);
	});
	const primary_post_tag = $derived(detected_hashtags[0] ?? 'other');
	const has_detected_hashtags = $derived(detected_hashtags.length > 0);
	const selected_close_friend_count = $derived(selected_close_friend_ids.length);
	const selected_close_friend_roster = $derived.by(() =>
		close_friend_candidates.filter((user) => selected_close_friend_ids.includes(user.id))
	);

	async function submit_post(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!can_submit) return;

		is_submitting = true;

		try {
			const response = await fetch('/api/posts', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					content: sanitized_text_content,
					audience: selected_audience,
					post_tag: primary_post_tag,
					post_tags: has_detected_hashtags ? [...detected_hashtags] : ['other'],
					allowed_user_ids: selected_audience === 'close_friends' ? [...selected_close_friend_ids] : []
				})
			});

			if (response.ok) {
				await response.json();
				
				// Call the callback if provided
				props.on_submit?.({
					content: sanitized_text_content,
					audience: selected_audience_option.label,
					post_tag: primary_post_tag,
					post_tags: has_detected_hashtags ? [...detected_hashtags] : ['other'],
					allowed_user_ids: selected_audience === 'close_friends' ? [...selected_close_friend_ids] : []
				});
				
				text_content = '';
				is_audience_menu_open = false;
				selected_close_friend_ids = [];
				
				// Reload the page data to show the new post
				const { invalidateAll: invalidate_all } = await import('$app/navigation');
				await invalidate_all();
			} else {
				const error = await response.json();
				console.error('Failed to create post:', error.error);
			}
		} catch (error) {
			console.error('Error creating post:', error);
		} finally {
			is_submitting = false;
		}
	}

	function toggle_audience_menu(): void {
		is_audience_menu_open = !is_audience_menu_open;
	}

	function select_audience(value: string): void {
		selected_audience = value;
		is_audience_menu_open = false;
		if (value === 'close_friends' && close_friend_candidates.length === 0) {
			void fetch_close_friend_candidates();
		}
	}

	function toggle_close_friend_list(): void {
		is_close_friend_list_collapsed = !is_close_friend_list_collapsed;
	}

	function remove_close_friend(user_id: string): void {
		selected_close_friend_ids = selected_close_friend_ids.filter((id) => id !== user_id);
	}

	async function fetch_close_friend_candidates(): Promise<void> {
		const request_id = ++close_friend_request_id;
		is_close_friend_loading = true;

		try {
			const response = await fetch('/api/users/following?limit=100');
			if (!response.ok || request_id !== close_friend_request_id) return;

			const data = await response.json();
			close_friend_candidates = Array.isArray(data.users) ? data.users : [];
		} catch (error) {
			if (request_id === close_friend_request_id) {
				console.error('Failed to load close friend candidates:', error);
				close_friend_candidates = [];
			}
		} finally {
			if (request_id === close_friend_request_id) {
				is_close_friend_loading = false;
			}
		}
	}

	function handle_document_click(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (!target.closest('.audience-menu')) {
			is_audience_menu_open = false;
		}
		if (!target.closest('.mention-autocomplete')) {
			close_mention_menu();
		}
	}

	function handle_menu_keydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			is_audience_menu_open = false;
		}
	}

	function handle_textarea_click(): void {
		if (selected_audience === 'close_friends') {
			is_close_friend_list_collapsed = true;
		}

		update_mention_state();
	}

	function close_mention_menu(): void {
		is_mention_menu_open = false;
		is_mention_loading = false;
		mention_results = [];
		active_mention_index = 0;
		mention_context = null;
	}

	function get_mention_query_context(content: string, caret_position: number):
		| { query: string; start: number; end: number }
		| null {
		const at_index = content.lastIndexOf('@', Math.max(0, caret_position - 1));
		if (at_index < 0) return null;

		const previous_char = at_index > 0 ? content[at_index - 1] : '';
		if (/[a-zA-Z0-9_.]/.test(previous_char)) {
			return null;
		}

		const query = content.slice(at_index + 1, caret_position);
		if (!/^[a-zA-Z0-9_]{0,24}$/.test(query)) {
			return null;
		}

		return {
			query,
			start: at_index,
			end: caret_position
		};
	}

	async function fetch_mention_suggestions(query: string): Promise<void> {
		const request_id = ++mention_request_id;
		is_mention_loading = true;

		try {
			const search_query = query.length > 0 ? query : '@';
			const response = await fetch(`/api/users/search?q=${encodeURIComponent(search_query)}`);

			if (!response.ok || request_id !== mention_request_id) return;

			const data = await response.json();
			mention_results = Array.isArray(data.users) ? data.users : [];
			active_mention_index = 0;
			is_mention_menu_open = mention_results.length > 0;
		} catch (error) {
			if (request_id === mention_request_id) {
				console.error('Failed to fetch mention suggestions:', error);
				close_mention_menu();
			}
		} finally {
			if (request_id === mention_request_id) {
				is_mention_loading = false;
			}
		}
	}

	function register_textarea(node: HTMLTextAreaElement) {
		textarea_element = node;
		return () => {
			if (textarea_element === node) {
				textarea_element = null;
			}
		};
	}

	function schedule_mention_lookup(query: string): void {
		clearTimeout(mention_timer);
		mention_timer = setTimeout(() => {
			void fetch_mention_suggestions(query);
		}, 180);
	}

	function update_mention_state(): void {
		if (!textarea_element) return;

		const context = get_mention_query_context(text_content, textarea_element.selectionStart ?? text_content.length);
		if (!context) {
			close_mention_menu();
			return;
		}

		mention_context = { start: context.start, end: context.end };
		schedule_mention_lookup(context.query);
	}

	async function insert_mention(user: { username: string }): Promise<void> {
		if (!mention_context || !textarea_element) return;

		const mention_text = `@${user.username} `;
		const before = text_content.slice(0, mention_context.start);
		const after = text_content.slice(mention_context.end);
		text_content = `${before}${mention_text}${after}`;

		close_mention_menu();
		await tick();

		const new_cursor_position = before.length + mention_text.length;
		textarea_element.focus();
		textarea_element.setSelectionRange(new_cursor_position, new_cursor_position);
	}

	function handle_textarea_keydown(event: KeyboardEvent): void {
		if (!is_mention_menu_open || mention_results.length === 0) {
			return;
		}

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active_mention_index = (active_mention_index + 1) % mention_results.length;
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			active_mention_index =
				(active_mention_index - 1 + mention_results.length) % mention_results.length;
			return;
		}

		if (event.key === 'Enter' || event.key === 'Tab') {
			event.preventDefault();
			void insert_mention(mention_results[active_mention_index]);
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			close_mention_menu();
		}
	}

</script>

<svelte:document onclick={handle_document_click} />

<form class="composer" onsubmit={submit_post} aria-label="Create a post">
	<!-- {#if props.title}
		<h2>{props.title}</h2>
	{/if} -->

	<div class="composer-controls" aria-label="Post controls">
		<div class="audience-menu">
			<button
				type="button"
				class="privacy-pill"
				aria-label="Audience selector"
				aria-haspopup="listbox"
				aria-expanded={is_audience_menu_open}
				onclick={toggle_audience_menu}
				onkeydown={handle_menu_keydown}
			>
				<div class="pill-content">
					<selected_audience_option.icon size={15} />
					<div>
						<strong>{selected_audience_option.label}</strong>
					</div>
				</div>
				<ChevronDown size={14} aria-hidden="true" />
			</button>

			{#if is_audience_menu_open}
				<ul
					class="audience-dropdown"
					role="listbox"
					aria-label="Select audience"
					onkeydown={handle_menu_keydown}
				>
					{#each audience_options as option (option.value)}
						<li>
							<button
								type="button"
								class="audience-item"
								class:is-selected={option.value === selected_audience}
								role="option"
								aria-selected={option.value === selected_audience}
								onclick={() => select_audience(option.value)}
							>
								<span class="audience-item-main">
									<span class="audience-item-icon">
										<option.icon size={14} />
									</span>
									<span class="audience-item-text">
										<strong>{option.label}</strong>
										<small>{option.hint}</small>
									</span>
								</span>
								{#if option.value === selected_audience}
									<Check size={14} aria-hidden="true" />
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>

	{#if selected_audience === 'close_friends'}
		<section class="close-friends-panel" aria-label="Who can see this post">
			<div class="close-friends-header">
				<div>
					<strong>Who can see</strong>
					<p>Select people from your following list.</p>
				</div>
				<div class="close-friends-controls">
					<span>{selected_close_friend_count} selected</span>
					{#if close_friend_candidates.length > 0}
						<button
							type="button"
							class="close-friends-toggle"
							onclick={toggle_close_friend_list}
							aria-expanded={!is_close_friend_list_collapsed}
							aria-label={is_close_friend_list_collapsed ? 'Expand close friends list' : 'Collapse close friends list'}
						>
							{is_close_friend_list_collapsed ? 'Expand list' : 'Collapse list'}
						</button>
					{/if}
				</div>
			</div>

			{#if is_close_friend_loading}
				<p class="close-friends-empty">Loading your following list...</p>
			{:else if close_friend_candidates.length > 0}
				{#if is_close_friend_list_collapsed}
					{#if selected_close_friend_roster.length > 0}
						<div class="close-friends-roster" aria-label="Selected close friends">
							{#each selected_close_friend_roster as user (user.id)}
								<span class="close-friend-badge">
									<span>@{user.handle}</span>
									<button
										type="button"
										class="close-friend-remove"
										onclick={() => remove_close_friend(user.id)}
										aria-label={`Remove @${user.handle}`}
									>
										x
									</button>
								</span>
							{/each}
						</div>
					{/if}
				{:else}
					<div class="close-friends-list">
						{#each close_friend_candidates as user (user.id)}
							<label class="close-friends-item">
								<input type="checkbox" bind:group={selected_close_friend_ids} value={user.id} />
								{#if user.avatar}
									<img class="close-friends-avatar" src={user.avatar} alt={user.name} />
								{:else}
									<img
										class="close-friends-avatar"
										src="/default-avatar.svg"
										alt={`${user.name} default avatar`}
									/>
								{/if}
								<span class="close-friends-meta">
									<strong>{user.name}</strong>
									<small>@{user.handle}</small>
								</span>
							</label>
						{/each}
					</div>
				{/if}
			{:else}
				<p class="close-friends-empty">You are not following anyone yet.</p>
			{/if}

			{#if close_friend_candidates.length > 0 && selected_close_friend_ids.length === 0}
				<p class="close-friends-empty">Select at least one person before posting.</p>
			{/if}
		</section>
	{/if}

	<div class="mention-autocomplete">
		<textarea
			{@attach register_textarea}
			bind:value={text_content}
			oninput={update_mention_state}
			onclick={handle_textarea_click}
			onkeydown={handle_textarea_keydown}
			placeholder={props.placeholder ?? 'What is floating in your mind?'}
			maxlength="280"
			rows={props.isExpanded ? 12 : 4}
			data-expanded={props.isExpanded ?? false}
			aria-label="Post content"
			autocomplete="off"
		></textarea>

		{#if is_mention_menu_open}
			<div class="mention-menu" role="listbox" aria-label="Mention suggestions">
				{#if is_mention_loading && mention_results.length === 0}
					<div class="mention-loading">Finding people...</div>
				{:else}
					{#each mention_results as user, index (user.id)}
						<button
							type="button"
							class="mention-item"
							class:is-active={index === active_mention_index}
							role="option"
							aria-selected={index === active_mention_index}
							onclick={() => {
								void insert_mention(user);
							}}
						>
							{#if user.image}
								<img class="mention-avatar" src={user.image} alt={user.name} />
							{:else}
								<img
									class="mention-avatar"
									src="/default-avatar.svg"
									alt={`${user.name} default avatar`}
								/>
							{/if}
							<span class="mention-meta">
								<strong>{user.name}</strong>
								<small>@{user.username}</small>
							</span>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>

	<footer class="composer-footer">
		<span class="counter" aria-live="polite">{text_content.length}/280</span>
		<button type="submit" disabled={!can_submit}>
			{#if is_submitting}
				<svg class="spinner" viewBox="0 0 24 24" fill="none">
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4 31.4" stroke-dashoffset="0">
						<animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
					</circle>
				</svg>
			{:else}
				<SendHorizontal size={16} />
			{/if}
			<span>{props.button_label ?? 'Post'}</span>
		</button>
	</footer>
</form>

<style>
	.composer {
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 14px;
		padding: 1rem;
		display: grid;
		gap: 0.75rem;
        box-shadow: 0 5px 5px #cad1db ;
	}

	textarea {
		display: block;
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		min-height: 6.5rem;
		max-height: 16rem;
		border-radius: 10px;
		padding: 0.75rem 0.8rem;
		font-size: 0.95rem;
		line-height: 1.45;
		color: #0f172a;
		transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease, height 200ms ease;
	}

	textarea[data-expanded="true"] {
		min-height: 14rem;
	}

	textarea::placeholder {
		color: #94a3b8;
	}

	.mention-autocomplete {
		position: relative;
		width: 100%;
		display: block;
	}

	.close-friends-panel {
		display: grid;
		gap: 0.75rem;
		padding: 0.85rem;
		border: 1px solid #dbe4ee;
		border-radius: 12px;
		background: #f8fbff;
	}

	.close-friends-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
	}

	.close-friends-controls {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.35rem;
	}

	.close-friends-toggle {
		border: 1px solid #bfdbfe;
		border-radius: 999px;
		padding: 0.2rem 0.55rem;
		font-size: 0.74rem;
		font-weight: 600;
		color: #1d4ed8;
		background: #eff6ff;
		cursor: pointer;
	}

	.close-friends-toggle:hover {
		background: #dbeafe;
	}

	.close-friends-header strong {
		display: block;
		font-size: 0.92rem;
		color: #0f172a;
	}

	.close-friends-header p,
	.close-friends-header span,
	.close-friends-empty {
		margin: 0;
		font-size: 0.82rem;
		color: #64748b;
	}

	.close-friends-list {
		display: grid;
		gap: 0.45rem;
		max-height: 15rem;
		overflow: auto;
	}

	.close-friends-roster {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.close-friend-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		padding: 0.24rem 0.5rem;
		border-radius: 999px;
		border: 1px solid #bfdbfe;
		background: #eff6ff;
		font-size: 0.78rem;
		color: #1e3a8a;
	}

	.close-friend-remove {
		width: 1.05rem;
		height: 1.05rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 999px;
		background: #dbeafe;
		color: #1d4ed8;
		font-size: 0.78rem;
		line-height: 1;
		cursor: pointer;
	}

	.close-friend-remove:hover {
		background: #bfdbfe;
	}

	.close-friends-item {
		display: grid;
		grid-template-columns: auto auto 1fr;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid #dbe4ee;
		border-radius: 10px;
		background: #ffffff;
		cursor: pointer;
	}

	.close-friends-item input {
		margin: 0;
	}

	.close-friends-avatar {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		object-fit: cover;
	}

	.close-friends-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.close-friends-meta strong,
	.close-friends-meta small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.mention-menu {
		position: absolute;
		left: 0;
		right: 0;
		top: 3rem;
		z-index: 30;
		display: grid;
		gap: 0.2rem;
		max-height: 12rem;
		overflow-y: auto;
		padding: 0.35rem;
		border-radius: 10px;
		border: 1px solid #d0d7e2;
		background: #ffffff;
		box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
	}

	.mention-item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.45rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}

	.mention-item:hover,
	.mention-item.is-active {
		background: #eff6ff;
		border-color: #bfdbfe;
	}

	.mention-avatar {
		width: 30px;
		height: 30px;
		border-radius: 999px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.mention-meta {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.mention-meta strong {
		font-size: 0.87rem;
		color: #0f172a;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mention-meta small {
		font-size: 0.78rem;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mention-loading {
		padding: 0.5rem;
		font-size: 0.84rem;
		color: #64748b;
	}

	.composer-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.audience-menu {
		position: relative;
		width: min(100%, 18rem);
	}

	.privacy-pill {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
		border: 1px solid #d0d7e2;
		border-radius: 10px;
		padding: 0.55rem 0.75rem;
		background: #f7f9fc;
		cursor: pointer;
	}

	.privacy-pill:hover {
		background: #eef3fb;
	}

	.privacy-pill:focus-visible {
		outline: 2px solid #7dd3fc;
		outline-offset: 2px;
	}

	.audience-dropdown {
		position: absolute;
		top: calc(100% + 0.45rem);
		left: 0;
		right: 0;
		z-index: 20;
		list-style: none;
		margin: 0;
		padding: 0.35rem;
		display: grid;
		gap: 0.2rem;
		border: 1px solid #d0d7e2;
		border-radius: 12px;
		background: #ffffff;
		box-shadow: 0 14px 32px rgba(15, 23, 42, 0.14);
	}

	.audience-item {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.6rem;
		border: none;
		border-radius: 9px;
		background: transparent;
		text-align: left;
		cursor: pointer;
		color: #0f172a;
	}

	.audience-item:hover {
		background: #f1f5f9;
	}

	.audience-item.is-selected {
		background: #e0f2fe;
	}

	.audience-item-main {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
	}

	.audience-item-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.45rem;
		height: 1.45rem;
		border-radius: 999px;
		background: #edf2f7;
		color: #334155;
	}

	.audience-item-text {
		display: grid;
		min-width: 0;
	}

	.audience-item-text strong {
		font-size: 0.84rem;
		line-height: 1.15;
	}

	.audience-item-text small {
		font-size: 0.73rem;
		line-height: 1.2;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pill-content {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.pill-content div {
		display: grid;
		min-width: 0;
	}

	.pill-content strong {
		font-size: 0.84rem;
		line-height: 1.15;
		color: #1e293b;
	}

	.composer-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	@media (max-width: 720px) {
		.composer-controls {
			grid-template-columns: 1fr;
		}
	}

	.counter {
		font-size: 0.82rem;
		color: #64748b;
	}

	.composer-footer button {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: none;
		border-radius: 999px;
		padding: 0.5rem 0.9rem;
		font-size: 0.88rem;
		font-weight: 600;
		color: #ffffff;
		background: #0ea5e9;
		cursor: pointer;
		transition: background 150ms ease;
	}

	.composer-footer button:hover:not(:disabled) {
		background: #0284c7;
	}

	.composer-footer button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
	}

	.spinner circle {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
