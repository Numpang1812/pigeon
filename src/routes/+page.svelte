<script lang="ts">
	import Navbar from '$lib/component/Navbar.svelte';
</script>

<Navbar />

<section class="feed-empty" aria-label="Feed preview"></section>

<style>
	.feed-empty {
		min-height: calc(100vh - 64px);
		margin-top: 64px;
	}
</style>
