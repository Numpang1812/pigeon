<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import { Bell } from 'lucide-svelte';

	const session = auth_client.useSession();
</script>

<svelte:head>
	<title>Notifications · Pigeon</title>
</svelte:head>

{#if $session.data}
	<main class="notifications-page" aria-label="Notifications page">
		<header class="page-header">
			<h1><Bell size={20} /> Notifications</h1>
			<p>Your recent mentions, replies, and activity will appear here.</p>
		</header>

		<section class="empty-state" aria-label="No notifications">
			<p>No notifications yet.</p>
		</section>
	</main>
{:else if !$session.isPending}
	<main class="login-prompt">
		<h2>Unauthenticated</h2>
		<p>You need to log in to view this page.</p>
		<a href={resolve('/')} class="login-link">Go to Login</a>
	</main>
{:else}
	<main class="loading">
		<p>Loading...</p>
	</main>
{/if}

<style>
	.notifications-page {
		max-width: 980px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem;
	}

	.page-header h1 {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0;
	}

	.page-header p {
		margin: 0.6rem 0 1.25rem;
		color: #64748b;
	}

	.empty-state {
		padding: 1rem;
		border: 1px solid #e2e8f0;
		border-radius: 0.75rem;
		background: #f8fafc;
	}

	.empty-state p {
		margin: 0;
	}
</style>
