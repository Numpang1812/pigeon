<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import ProfileLoadingSkeleton from '$lib/components/profile/ProfileLoadingSkeleton.svelte';
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import type { LayoutData } from './$types';

	const { children, data } = $props<{ children: import('svelte').Snippet; data: LayoutData }>();

	let username = $state('');
	let username_error = $state<string | null>(null);
	let submitting_username = $state(false);

	async function handle_username_submit(event: SubmitEvent) {
		event.preventDefault();
		username_error = null;

		const normalized = username.trim().toLowerCase();
		if (!/^[a-z0-9_]{2,15}$/.test(normalized)) {
			username_error =
				'Username must be 2-15 characters using only letters, numbers, or underscores.';
			return;
		}

		submitting_username = true;
		try {
			const response = await fetch('/api/users/username', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ username: normalized })
			});

			if (!response.ok) {
				const payload = await response.json();
				throw new Error(payload?.error || 'Failed to save username.');
			}

			await invalidateAll();
		} catch (error) {
			username_error = error instanceof Error ? error.message : 'Failed to save username.';
		} finally {
			submitting_username = false;
		}
	}
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if data.is_authenticated}
	<Navbar />
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">
			{#if navigating?.to?.url.pathname.startsWith('/profile') && !navigating.to.url.pathname.startsWith('/profile/edit')}
				<ProfileLoadingSkeleton />
			{:else}
				{@render children()}
			{/if}
		</main>
	</div>

	{#if data.username_required}
		<div
			class="username-lock"
			role="dialog"
			aria-modal="true"
			aria-labelledby="username-lock-title"
		>
			<div class="username-lock__backdrop"></div>
			<div class="username-lock__panel">
				<h2 id="username-lock-title">Choose your username</h2>
				<p>Your account is almost ready. Pick a unique username to continue.</p>
				<form class="username-lock__form" onsubmit={handle_username_submit} novalidate>
					<label for="username-lock-input">Username</label>
					<div class="username-lock__input-row">
						<span>@</span>
						<input
							id="username-lock-input"
							type="text"
							autocomplete="username"
							bind:value={username}
							disabled={submitting_username}
							required
							maxlength="15"
						/>
					</div>
					{#if username_error}
						<p class="username-lock__error">{username_error}</p>
					{/if}
					<button type="submit" disabled={submitting_username}>
						{submitting_username ? 'Saving...' : 'Save username'}
					</button>
				</form>
			</div>
		</div>
	{/if}
{:else}
	{@render children()}
{/if}

<style>
	.username-lock {
		position: fixed;
		inset: 0;
		z-index: 2000;
		display: grid;
		place-items: center;
	}

	.username-lock__backdrop {
		position: absolute;
		inset: 0;
		background: rgba(8, 12, 20, 0.58);
		backdrop-filter: blur(4px);
	}

	.username-lock__panel {
		position: relative;
		width: min(92vw, 460px);
		padding: 1.25rem;
		border-radius: 16px;
		background: #ffffff;
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);
	}

	.username-lock__panel h2 {
		margin: 0;
		font-size: 1.2rem;
	}

	.username-lock__panel p {
		margin: 0.5rem 0 0;
		color: #475569;
	}

	.username-lock__form {
		margin-top: 1rem;
		display: grid;
		gap: 0.55rem;
	}

	.username-lock__input-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid #cbd5e1;
		border-radius: 10px;
	}

	.username-lock__input-row span {
		color: #0f172a;
		font-weight: 700;
	}

	.username-lock__input-row input {
		width: 100%;
		border: 0;
		outline: none;
		font-size: 0.98rem;
	}

	.username-lock__error {
		margin: 0;
		color: #b91c1c;
		font-size: 0.92rem;
	}

	.username-lock__form button {
		margin-top: 0.35rem;
		padding: 0.7rem 1rem;
		border: 0;
		border-radius: 999px;
		background: #0ea5e9;
		color: #fff;
		font-weight: 700;
		cursor: pointer;
	}

	.username-lock__form button:disabled {
		opacity: 0.68;
		cursor: not-allowed;
	}
</style>
