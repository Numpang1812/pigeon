<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import type { LayoutData } from './$types';

	const { children, data } = $props<{ children: import('svelte').Snippet; data: LayoutData }>();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if data.is_authenticated}
	<Navbar />
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">{@render children()}</main>
	</div>
{:else}
	{@render children()}
{/if}
