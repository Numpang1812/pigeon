<script lang="ts">
	import ProfilePageView from '$lib/components/ProfilePageView.svelte';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();
</script>

<ProfilePageView data={data} show_back_button={true} enable_follow_ui={true} />
