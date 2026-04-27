<script lang="ts">
	import { onMount } from 'svelte';
	import { X, Loader } from 'lucide-svelte';
	import Post from './Post.svelte';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		post_id: string;
		on_close: () => void;
	}

	const { post_id, on_close }: Props = $props();

	let post_data = $state<any>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/posts/${post_id}`);
			if (!res.ok) {
				const err = await res.json();
				error = err.error || 'Failed to load post';
				return;
			}
			const data = await res.json();
			post_data = data.post;
		} catch (e) {
			console.error('Error fetching post for modal:', e);
			error = 'Failed to load post';
		} finally {
			loading = false;
		}
	});

	function handle_backdrop_click(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			on_close();
		}
	}

	// Escape key to close
	function handle_keydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			on_close();
		}
	}
</script>

<svelte:window onkeydown={handle_keydown} />

<div
	class="modal-backdrop"
	onclick={handle_backdrop_click}
	transition:fade={{ duration: 200 }}
	role="dialog"
	aria-modal="true"
	aria-label="Post details modal"
>
	<div class="modal-container" transition:scale={{ duration: 200, start: 0.95 }}>
		<header class="modal-header">
			<button type="button" class="close-btn" onclick={on_close} aria-label="Close modal">
				<X size={20} />
			</button>
		</header>

		<div class="modal-body">
			{#if loading}
				<div class="state-container">
					<Loader size={32} class="spinner" />
					<p>Loading post...</p>
				</div>
			{:else if error}
				<div class="state-container error">
					<p>{error}</p>
					<button type="button" class="retry-btn" onclick={() => window.location.reload()}>
						Retry
					</button>
				</div>
			{:else if post_data}
				<div class="post-wrapper">
					<Post
						post_id={post_data.id}
						post_tag={post_data.post_tag}
						post_tags={post_data.post_tags}
						posted_at={post_data.posted_at}
						content={post_data.content}
						audience={post_data.audience}
						author_name={post_data.author_name}
						author_handle={post_data.author_handle}
						author_bio={post_data.author_bio}
						avatar_url={post_data.avatar_url}
						verified={post_data.verified}
						metrics={post_data.metrics}
						user_liked={post_data.user_liked}
						user_disliked={post_data.user_disliked}
						user_reposted={post_data.user_reposted}
						is_author={post_data.is_author}
						is_edited={post_data.is_edited}
					/>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(15, 23, 42, 0.65);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.modal-container {
		background: #ffffff;
		width: 100%;
		max-width: 680px;
		max-height: 90vh;
		border-radius: 1.25rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.modal-header {
		display: flex;
		justify-content: flex-end;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #f1f5f9;
		background: #fff;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.close-btn {
		background: #f1f5f9;
		border: none;
		color: #64748b;
		width: 2.25rem;
		height: 2.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: #e2e8f0;
		color: #0f172a;
		transform: rotate(90deg);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
		background: #f8fafc;
	}

	.state-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		gap: 1rem;
		color: #64748b;
	}

	.spinner {
		animation: spin 1s linear infinite;
		color: #0ea5e9;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.error p {
		color: #ef4444;
		font-weight: 600;
	}

	.retry-btn {
		padding: 0.5rem 1.25rem;
		background: #0ea5e9;
		color: white;
		border: none;
		border-radius: 999px;
		font-weight: 700;
		cursor: pointer;
	}

	.post-wrapper {
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
	}

	@media (max-width: 640px) {
		.modal-container {
			max-height: 100vh;
			border-radius: 0;
		}

		.modal-backdrop {
			padding: 0;
		}
	}
</style>
