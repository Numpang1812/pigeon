<script lang="ts">
	import { resolve } from '$app/paths';

	let is_redirecting = $state(false);

	function handle_login_redirect(event: MouseEvent) {
		event.preventDefault();
		is_redirecting = true;
		
		// Use a slight delay to allow the loading animation to be visible
		setTimeout(() => {
			window.location.href = resolve('/');
		}, 600);
	}
</script>

<main class="login-prompt">
	{#if is_redirecting}
		<div class="redirect-state">
			<div class="loading-bar-container">
				<div class="loading-bar"></div>
			</div>
			<p class="redirect-text">Preparing secure login...</p>
		</div>
	{:else}
		<div class="prompt-content">
			<h2>Unauthenticated</h2>
			<p>You need to log in to view this page.</p>
			<a href={resolve('/')} class="login-link" onclick={handle_login_redirect}>
				Go to Login
			</a>
		</div>
	{/if}
</main>

<style>
	.login-prompt {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		padding: 2rem;
		text-align: center;
		background: #ffffff;
	}

	.prompt-content h2 {
		margin: 0 0 0.5rem;
		font-size: 1.5rem;
		font-weight: 800;
		color: #0f172a;
	}

	.prompt-content p {
		margin: 0 0 1.5rem;
		color: #64748b;
	}

	.login-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem 1.5rem;
		background: #0ea5e9;
		color: #ffffff;
		font-weight: 700;
		text-decoration: none;
		border-radius: 999px;
		transition: transform 0.2s, filter 0.2s;
	}

	.login-link:hover {
		filter: brightness(1.1);
		transform: translateY(-1px);
	}

	.redirect-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		width: 100%;
		max-width: 280px;
	}

	.loading-bar-container {
		width: 100%;
		height: 4px;
		background: #f1f5f9;
		border-radius: 999px;
		overflow: hidden;
		position: relative;
	}

	.loading-bar {
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 40%;
		background: #0ea5e9;
		border-radius: 999px;
		animation: loading-slide 1s infinite ease-in-out;
	}

	.redirect-text {
		font-size: 0.9rem;
		font-weight: 600;
		color: #0ea5e9;
		margin: 0;
		animation: pulse 1.5s infinite ease-in-out;
	}

	@keyframes loading-slide {
		0% { left: -40%; }
		100% { left: 100%; }
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
</style>
