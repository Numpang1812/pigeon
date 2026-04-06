<script lang="ts">
	import ProfileRouteShell from '$lib/components/profile/ProfileRouteShell.svelte';
	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();
</script>

<ProfileRouteShell data={data} show_back_button={true} enable_follow_ui={true} />
