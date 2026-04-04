<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import {
		ChevronRight,
		KeyRound,
		Mail,
		Shield,
		Bell,
		Palette,
		Link2,
		Trash2
	} from 'lucide-svelte';

	const session = auth_client.useSession();

	type ActionItem = {
		title: string;
		description: string;
		icon: typeof KeyRound;
		kind?: 'default' | 'danger';
	};

	const account_actions: ActionItem[] = [
		{
			title: 'Change email',
			description: 'Update the email address associated with your account.',
			icon: Mail
		},
		{
			title: 'Connected accounts',
			description: 'Link or unlink Google, GitHub, and other providers.',
			icon: Link2
		}
	];

	const security_actions: ActionItem[] = [
		{
			title: 'Change password',
			description: 'Update your password to keep your account secure.',
			icon: KeyRound
		},
		{
			title: 'Privacy & security',
			description: 'Manage blocked users, visibility, and sign-in activity.',
			icon: Shield
		}
	];

	const preference_actions: ActionItem[] = [
		{
			title: 'Notifications',
			description: 'Choose which updates you want to receive.',
			icon: Bell
		},
		{
			title: 'Appearance',
			description: 'Theme, contrast, and other display options.',
			icon: Palette
		}
	];

	const danger_actions: ActionItem[] = [
		{
			title: 'Delete account',
			description: 'Permanently delete your account and your data.',
			icon: Trash2,
			kind: 'danger'
		}
	];
</script>

<svelte:head>
	<title>Settings · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="settings">
		<header class="settings-header">
			<div class="settings-title-block">
				<h1 class="settings-title">Settings</h1>
				<p class="settings-sub">Manage your account, security, and preferences. (Design-only for now.)</p>
			</div>
		</header>

		<div class="settings-grid" role="list">
			<section class="panel" aria-label="Account settings" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Account</h2>
					<p class="panel-sub">Email, connected accounts, and profile controls.</p>
				</div>
				<div class="panel-body">
					{#each account_actions as item (item.title)}
						<button class="action" type="button" aria-label={item.title}>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								<span class="badge" aria-label="Coming soon">Soon</span>
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}
				</div>
			</section>

			<section class="panel" aria-label="Security settings" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Security</h2>
					<p class="panel-sub">Password, privacy, and sign-in related settings.</p>
				</div>
				<div class="panel-body">
					{#each security_actions as item (item.title)}
						<button class="action" type="button" aria-label={item.title}>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								<span class="badge" aria-label="Coming soon">Soon</span>
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}
				</div>
			</section>

			<section class="panel" aria-label="Preference settings" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Preferences</h2>
					<p class="panel-sub">Notifications, appearance, and other choices.</p>
				</div>
				<div class="panel-body">
					{#each preference_actions as item (item.title)}
						<button class="action" type="button" aria-label={item.title}>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								<span class="badge" aria-label="Coming soon">Soon</span>
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}
				</div>
			</section>

			<section class="panel danger" aria-label="Danger zone" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Danger zone</h2>
					<p class="panel-sub">Irreversible actions.</p>
				</div>
				<div class="panel-body">
					{#each danger_actions as item (item.title)}
						<button class="action danger-action" type="button" aria-label={item.title}>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								<span class="badge danger-badge" aria-label="Coming soon">Soon</span>
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}
				</div>
			</section>
		</div>
	</div>
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
	.settings {
		min-height: 100%;
		padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 3rem;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 38%, #ffffff 100%);
		color: #0f172a;
	}

	.settings-header {
		max-width: 1100px;
		margin: 0 auto 1.75rem;
	}

	.settings-title {
		margin: 0 0 0.35rem;
		font-size: clamp(1.65rem, 3vw, 2rem);
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.settings-sub {
		margin: 0;
		max-width: 46rem;
		font-size: 0.95rem;
		line-height: 1.55;
		color: #64748b;
	}

	.settings-grid {
		max-width: 1100px;
		margin: 0 auto;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.1rem;
	}

	.panel {
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 1rem;
		box-shadow: 0 20px 45px rgba(15, 23, 42, 0.06);
		backdrop-filter: blur(10px);
		overflow: hidden;
	}

	.panel-head {
		padding: 1.05rem 1.1rem 0.9rem;
		border-bottom: 1px solid rgba(148, 163, 184, 0.22);
	}

	.panel-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.panel-sub {
		margin: 0.25rem 0 0;
		color: #64748b;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.panel-body {
		display: flex;
		flex-direction: column;
		padding: 0.35rem;
	}

	.action {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		text-align: left;
		width: 100%;
		border: none;
		background: transparent;
		border-radius: 0.85rem;
		padding: 0.85rem 0.85rem;
		cursor: pointer;
		transition:
			background 0.2s ease,
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.action:hover {
		background: rgba(226, 232, 240, 0.65);
		box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
		transform: translateY(-1px);
	}

	.action:active {
		transform: translateY(0);
	}

	.action:focus-visible {
		outline: 2px solid rgba(59, 130, 246, 0.35);
		outline-offset: 2px;
	}

	.action-left {
		display: inline-flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
	}

	.action-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.15rem;
		height: 2.15rem;
		border-radius: 0.8rem;
		background: radial-gradient(circle at 25% 20%, rgba(186, 230, 253, 0.65), transparent 55%),
			linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.02));
		border: 1px solid rgba(148, 163, 184, 0.35);
		color: #0f172a;
		flex: 0 0 auto;
	}

	.action-text {
		display: flex;
		flex-direction: column;
		gap: 0.18rem;
		min-width: 0;
	}

	.action-title {
		font-weight: 800;
		letter-spacing: -0.015em;
	}

	.action-desc {
		color: #64748b;
		font-size: 0.9rem;
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.action-right {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		flex: 0 0 auto;
	}

	.badge {
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.02em;
		padding: 0.26rem 0.55rem;
		border-radius: 999px;
		border: 1px solid rgba(148, 163, 184, 0.35);
		color: #0f172a;
		background: rgba(248, 250, 252, 0.9);
	}

	.chev {
		color: rgba(15, 23, 42, 0.55);
	}

	.panel.danger {
		border-color: rgba(244, 63, 94, 0.25);
	}

	.danger-action .action-icon {
		border-color: rgba(244, 63, 94, 0.25);
		background: radial-gradient(circle at 25% 20%, rgba(254, 202, 202, 0.75), transparent 55%),
			linear-gradient(180deg, rgba(244, 63, 94, 0.08), rgba(15, 23, 42, 0.02));
	}

	.danger-badge {
		border-color: rgba(244, 63, 94, 0.25);
		background: rgba(254, 242, 242, 0.95);
	}

	.login-prompt {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
		gap: 1rem;
	}

	.login-link {
		color: #1da1f2;
		font-weight: 700;
		text-decoration: none;
	}

	.login-link:hover {
		text-decoration: underline;
	}

	.loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	@media (max-width: 900px) {
		.settings {
			padding-bottom: 2.25rem;
		}

		.settings-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

