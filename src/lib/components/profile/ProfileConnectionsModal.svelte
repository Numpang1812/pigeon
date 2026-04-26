<script lang="ts">
	import { resolve } from '$app/paths';
	import { X, BadgeCheck } from 'lucide-svelte';
	import type { ProfileConnection } from './types';

	interface ProfileConnectionsModalProps {
		mode: 'followers' | 'following' | null;
		followers: ProfileConnection[];
		following: ProfileConnection[];
		on_item_click?: (event: MouseEvent, handle: string) => void | Promise<void>;
		on_close: () => void;
	}

	const props: ProfileConnectionsModalProps = $props();

	const list_title = $derived(props.mode === 'following' ? 'Following' : 'Followers');
	const active_list = $derived(props.mode === 'following' ? props.following : props.followers);
	const empty_text = $derived(
		props.mode === 'following' ? 'Not following anyone yet.' : 'No followers yet.'
	);

	function stop_event_propagation(event: Event) {
		event.stopPropagation();
	}
</script>

{#if props.mode}
	<div
		class="modal-backdrop"
		onclick={props.on_close}
		onkeydown={(e) => e.key === 'Escape' && props.on_close()}
		role="button"
		tabindex="0"
		aria-label="Close connections"
	>
		<div
			class="connections-modal"
			onclick={stop_event_propagation}
			onkeydown={stop_event_propagation}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<h2>{list_title}</h2>
				<button type="button" class="modal-close" onclick={props.on_close} aria-label="Close">
					<X size={18} strokeWidth={2.5} />
				</button>
			</div>

			<div class="modal-body">
				{#if active_list.length > 0}
					<div class="connection-list">
						{#each active_list as user (user.id)}
							<a
								class="connection-item"
								href={resolve(`/profile/${user.handle}`)}
								onclick={(event) => props.on_item_click?.(event, user.handle)}
							>
								{#if user.avatar}
									<img src={user.avatar} alt={user.name} />
								{:else}
									<img src="/default-avatar.svg" alt={`${user.name} default avatar`} />
								{/if}
								<div>
									<div class="name-row">
										<strong>{user.name}</strong>
										{#if user.verified}
											<span class="verified-icon" aria-label="Verified account" title="Verified account">
												<BadgeCheck size={16} aria-hidden="true" fill="#0ea5e9" color="white" />
											</span>
										{/if}
									</div>
									<p>@{user.handle}</p>
								</div>
							</a>
						{/each}
					</div>
				{:else}
					<p class="connection-empty">{empty_text}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
		animation: backdrop_fade_in 0.22s ease-out;
	}

	.connections-modal {
		background: white;
		border-radius: 28px;
		width: 100%;
		max-width: 720px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		animation: modal_slide_in 0.3s ease-out;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
		will-change: transform, opacity;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1rem;
		border-bottom: 2px solid #f1f5f9;
		background: #fafbfc;
		border-radius: 28px 28px 0 0;
	}

	.modal-header h2 {
		font-size: 23px;
		font-weight: 700;
		margin: 0;
		margin-left: 10px;
		color: #0f1419;
		letter-spacing: -0.5px;
	}

	.modal-close {
		background: #e8ecf1;
		border: none;
		font-size: 24px;
		line-height: 1;
		cursor: pointer;
		color: #536471;
		padding: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.modal-close:hover {
		background-color: #d4d9df;
		color: #0f1419;
	}

	.modal-body {
		overflow-y: auto;
		padding: 1.5rem 0;
		flex: 1;
		scroll-behavior: smooth;
	}

	.modal-body::-webkit-scrollbar {
		width: 8px;
	}

	.modal-body::-webkit-scrollbar-track {
		background: #f1f5f9;
	}

	.modal-body::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 4px;
	}

	.modal-body::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}

	.connection-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 1.5rem;
	}

	.connection-item {
		width: 100%;
		border: 1px solid transparent;
		background: transparent;
		display: flex;
		align-items: center;
		gap: 1.2rem;
		padding: 1.2rem 1.2rem;
		border-radius: 16px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s ease;
	}

	.connection-item:hover {
		background: #f0f3f7;
		border-color: #e1e8ed;
	}

	.connection-item img {
		width: 56px;
		height: 56px;
		border-radius: 9999px;
		object-fit: cover;
		flex-shrink: 0;
		border: 2px solid #e1e8ed;
	}

	.connection-item strong {
		display: block;
		font-size: 16px;
		font-weight: 600;
		color: #0f1419;
		line-height: 1.4;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.verified-icon {
		display: inline-flex;
		align-items: center;
		color: #ffffff;
		flex-shrink: 0;
	}

	.connection-item p {
		margin: 0;
		font-size: 15px;
		color: #536471;
		line-height: 1.4;
	}

	.connection-empty {
		margin: 0;
		color: #536471;
		font-size: 15px;
		text-align: center;
		padding: 3rem 2rem;
		line-height: 1.6;
	}

	@keyframes modal_slide_in {
		from {
			opacity: 0;
			transform: translateY(18px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	@keyframes backdrop_fade_in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
