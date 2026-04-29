<script lang="ts">
	import { goto } from '$app/navigation';
	import { PostTextbox } from '$lib';
	import { PenTool, Sparkles } from 'lucide-svelte';

	import type { PostData } from '$lib/types';
	import { resolve } from '$app/paths';

	async function handle_submit(_payload: { content: string; audience: string; post_tag: string; post_tags: string[]; allowed_user_ids: string[] }, post?: PostData) {
		if (post?.id) {
			await goto(resolve(`/home#post-${post.id}`));
		} else {
			await goto(resolve('/home'));
		}
	}
</script>

<main class="compose-page" aria-label="Compose page">
	<section class="compose-container">
		<div class="compose-card">
			
			<!-- Top Row -->
			<div class="compose-top">
				<div class="compose-title">
					<div class="title-icon">
						<PenTool size={20} />
					</div>
					<span>Create Post</span>
				</div>
			</div>

			<!-- Textbox -->
			<PostTextbox button_label="Post" isExpanded={true} on_submit={handle_submit} />

			<!-- Inline tip -->
			<p class="compose-tip">
				<Sparkles size={14} />
				<span>Tip: Use #hashtags to reach more people (Up to 5 hashtags)</span>
			</p>

		</div>
	</section>
</main>

<style>
	.compose-page {
		min-height: 100svh;
		width: calc(100% + 3rem);
		margin: -1.5rem;
		display: flex;
		justify-content: center;
		padding: 2rem 1rem;
		
	}

	.compose-container {
		width: 100%;
		max-width: 640px;
		height: fit-content;
	}

	.compose-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}

	.compose-title {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: #334155;
	}

	.title-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.8rem;
		height: 1.8rem;
		background: #f1f5f9;
		border-radius: 0.4rem;
		color: #64748b;
	}

	.compose-tip {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: #788aa4;
		margin-top: 0.6rem;
	}

	.title-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		height: 2.4rem;
		background: #f1f5f9;
		border: 1px solid #e2e8f0;
		border-radius: 0.5rem;
		color: #64748b;
		flex-shrink: 0;
	}

	@media (max-width: 900px) {
		.compose-page {
			width: calc(100% + 2rem);
			margin: -1rem;
		}

	}

</style>
