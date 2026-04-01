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

	interface PostTextboxProps {
		placeholder?: string;
		button_label?: string;
		isExpanded?: boolean;
		on_submit?: (payload: {
			content: string;
			audience: string;
			post_tag: string;
			post_tags: string[];
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
			hint: 'Followers and friends only',
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
	const hashtag_pattern = /(^|[^a-z0-9_])#([a-z0-9_]{2,24})\b/gi;
	const sanitized_text_content = $derived.by(() =>
		text_content
			.replace(hashtag_pattern, '$1')
			.replace(/\s{2,}/g, ' ')
			.replace(/\s+([.,!?;:])/g, '$1')
			.trim()
	);
	const can_submit = $derived(sanitized_text_content.length > 0);
	const selected_audience_option = $derived(
		audience_options.find((option) => option.value === selected_audience) ?? audience_options[0]
	);
	const detected_hashtags = $derived.by(() => {
		const matches = text_content.matchAll(hashtag_pattern);
		const tags = Array.from(matches, (match) => match[2].toLowerCase());
		return Array.from(new Set(tags)).slice(0, 6);
	});
	const primary_post_tag = $derived(detected_hashtags[0] ?? 'general');
	const has_detected_hashtags = $derived(detected_hashtags.length > 0);

	function submit_post(event: SubmitEvent): void {
		event.preventDefault();
		if (!can_submit) return;

		props.on_submit?.({
			content: sanitized_text_content,
			audience: selected_audience_option.label,
			post_tag: primary_post_tag,
			post_tags: has_detected_hashtags ? [...detected_hashtags] : ['general']
		});
		text_content = '';
		is_audience_menu_open = false;
	}

	function toggle_audience_menu(): void {
		is_audience_menu_open = !is_audience_menu_open;
	}

	function select_audience(value: string): void {
		selected_audience = value;
		is_audience_menu_open = false;
	}

	function handle_document_click(event: MouseEvent): void {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (!target.closest('.audience-menu')) {
			is_audience_menu_open = false;
		}
	}

	function handle_menu_keydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			is_audience_menu_open = false;
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
						<small>{selected_audience_option.hint}</small>
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

	<textarea
		bind:value={text_content}
		placeholder={props.placeholder ?? 'What is floating in your mind?'}
		maxlength="280"
		rows={props.isExpanded ? 12 : 4}
		data-expanded={props.isExpanded ?? false}
		aria-label="Post content"
	></textarea>

	<footer class="composer-footer">
		<span class="counter" aria-live="polite">{text_content.length}/280</span>
		<button type="submit" disabled={!can_submit}>
			<SendHorizontal size={16} />
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

	/* textarea:focus {
		outline: none;
		border-color: #0ea5e9;
		box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
		background: #ffffff;
	} */

	textarea::placeholder {
		color: #94a3b8;
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
		width: 100%;
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

	.pill-content small {
		font-size: 0.73rem;
		line-height: 1.2;
		color: #64748b;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
</style>
