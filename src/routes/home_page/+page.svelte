<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import Sidebar from '$lib/component/Sidebar.svelte';
	import Navbar from '$lib/component/Navbar.svelte';

	const session = auth_client.useSession();
</script>

<svelte:head>
	<title>Home · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">
			<Navbar />
			<section class="feed">
				<h2>Home Page</h2>
				<p>Welcome to your authenticated home page!</p>
			</section>
		</main>
	</div>
{:else if !$session.isPending}
	<main class="login-prompt">
		<h2>Unauthenticated</h2>
		<p>You need to log in to view this page.</p>
		<a href={resolve('/')} class="login-link">Go to Login</a>
	</main>
{:else}
	<main class="loading">
		<p>Loading...</p>
	</main>
{/if}

<style>
	.app-shell {
		--sidebar-offset: 260px;
		display: flex;
		gap: 0;
		min-height: 100vh;
	}

	.page-content {
		margin-left: var(--sidebar-offset);
		flex: 1;
		transition: margin-left 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.page-content :global(.navbar) {
		left: var(--sidebar-offset);
		transition: left 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.feed {
		min-height: calc(100vh - 64px);
		margin-top: 64px;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	h2 {
		margin-bottom: 1rem;
		font-weight: 700;
	}

	.login-prompt {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		gap: 1rem;
	}

	.login-link {
		color: #1da1f2;
		font-weight: 700;
		text-decoration: none;
	}

	.login-link:hover {
		text-decoration: underline;
	}

	.loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	/* Mobile responsive */
	@media (max-width: 900px) {
		.app-shell {
			--sidebar-offset: 0px;
		}

		.page-content {
			margin-left: 0;
		}
	}
</style>
