<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { auth_client } from '$lib/auth-client';

	let { children } = $props();

	const session = auth_client.useSession();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if $session.data || $session.isPending}
	<Navbar />
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">{@render children()}</main>
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.loading-session {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f8fbff;
	}

	.loading-session p {
		color: #64748b;
		font-size: 1rem;
	}
</style>
