<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/component/Navbar.svelte';
	import Sidebar from '$lib/component/Sidebar.svelte';
	import { auth_client } from '$lib/auth-client';

	let { children } = $props();

	const session = auth_client.useSession();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if $session.data}
	<Navbar />
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">{@render children()}</main>
	</div>
{:else}
	{@render children()}
{/if}
