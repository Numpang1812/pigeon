<script lang="ts">
	import { X, CheckCircle, AlertCircle } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	interface Props {
		message: string;
		type?: 'success' | 'error';
		duration?: number;
		onClose: () => void;
	}

	let { message, type = 'success', duration = 5000, onClose }: Props = $props();

	onMount(() => {
		if (duration > 0) {
			const timer = setTimeout(() => {
				onClose();
			}, duration);
			return () => clearTimeout(timer);
		}
	});
</script>

<div
	class="toast-container"
	in:fly={{ y: -20, duration: 300 }}
	out:fade={{ duration: 200 }}
>
	<div class="toast" class:success={type === 'success'} class:error={type === 'error'}>
		<div class="icon">
			{#if type === 'success'}
				<CheckCircle size={18} />
			{:else}
				<AlertCircle size={18} />
			{/if}
		</div>
		<p class="message">{message}</p>
		<button class="close-btn" onclick={onClose} aria-label="Close notification">
			<X size={16} />
		</button>
	</div>
</div>

<style>
	.toast-container {
		position: fixed;
		top: 24px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 20px;
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.94);
		backdrop-filter: blur(12px) saturate(180%);
		box-shadow: 
			0 12px 32px rgba(0, 0, 0, 0.12),
			0 2px 8px rgba(0, 0, 0, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.5);
		min-width: 320px;
		max-width: 90vw;
		pointer-events: auto;
		transition: transform 0.2s cubic-bezier(0.17, 0.67, 0.83, 0.67);
	}

	.toast:hover {
		transform: scale(1.02);
	}

	.toast.success {
		border-left: 5px solid #10b981;
	}

	.toast.error {
		border-left: 5px solid #ef4444;
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.success .icon {
		color: #10b981;
	}

	.error .icon {
		color: #ef4444;
	}

	.message {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 500;
		color: #1f2937;
		color: #374151;
		flex-grow: 1;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 6px;
		border: none;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #4b5563;
	}
</style>
