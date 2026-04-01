<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/component/Navbar.svelte';
	import Sidebar from '$lib/component/Sidebar.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<Navbar />
<div class="app-shell">
	<Sidebar />
	<main class="page-content">{@render children()}</main>
</div>
