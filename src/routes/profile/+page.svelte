<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { ProfilePageView } from '$lib';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	async function reset_scroll_top(): Promise<void> {
		await tick();
		window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
		document.documentElement.scrollTop = 0;
		document.body.scrollTop = 0;
		const page_content = document.querySelector<HTMLElement>('.page-content');
		if (page_content) {
			page_content.scrollTop = 0;
		}
	}

	onMount(() => {
		void reset_scroll_top();
	});

	afterNavigate(() => {
		void reset_scroll_top();
	});
</script>

<ProfilePageView data={data} force_owner={true} />
