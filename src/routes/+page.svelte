<script lang="ts">
	import Login from '$lib/+login.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';

	const session = auth_client.useSession();

	$effect(() => {
		if ($session.data) {
			goto(resolve('/home'));
		}
	});
</script>

<Login />
