<script lang="ts">
	import Login from '$lib/+login.svelte';
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';

	const session = auth_client.useSession();

	$effect(() => {
		if ($session.data) {
			window.location.href = resolve('/home');
		}
	});
</script>

<Login />
