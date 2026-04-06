<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { ProfilePageView } from '$lib';
	import type { ProfileData } from './types';

	interface ProfileRouteShellProps {
		data: ProfileData;
		show_back_button?: boolean;
		enable_follow_ui?: boolean;
		force_owner?: boolean;
	}

	const props: ProfileRouteShellProps = $props();

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

<ProfilePageView
	data={props.data}
	show_back_button={props.show_back_button}
	enable_follow_ui={props.enable_follow_ui}
	force_owner={props.force_owner}
/>
