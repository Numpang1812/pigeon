<script lang="ts">
	import { auth_client } from '$lib/auth-client';
	import {
		ChevronRight,
		KeyRound,
		Mail,
		Shield,
		Bell,
		Palette,
		Link2,
		Trash2,
		MapPin,
		Loader2,
		UserPlus,
		Heart,
		ThumbsDown,
		Repeat2,
		Bird
	} from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';
	import UnauthenticatedPrompt from '$lib/components/UnauthenticatedPrompt.svelte';
	import HomeLocationGate from '$lib/components/pigeon/HomeLocationGate.svelte';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();

	const session = auth_client.useSession();

	let showing_loft_gate = $state(false);

	const loft_accuracy_label = $derived.by(() => {
		const accuracy = data.home?.accuracy_m;
		if (!accuracy) return null;
		if (accuracy < 1000) return `within ${Math.round(accuracy)} m`;
		return `within ${Math.round(accuracy / 1000)} km`;
	});

	const loft_coords_label = $derived(
		data.home ? `${data.home.lat.toFixed(4)}, ${data.home.lng.toFixed(4)}` : null
	);

	type ActionItem = {
		title: string;
		description: string;
		icon: typeof KeyRound;
		kind?: 'default' | 'danger';
		/** Set when the action works right here; opens its inline UI. */
		on_open?: () => void;
	};

	// Change password state
	let showing_password_form = $state(false);
	let current_password = $state('');
	let new_password = $state('');
	let confirm_password = $state('');

	function toggle_password_form(): void {
		showing_password_form = !showing_password_form;
		current_password = '';
		new_password = '';
		confirm_password = '';
	}

	// Delete account state
	let show_delete_modal = $state(false);
	let is_deleting = $state(false);
	let delete_confirmation = $state('');
	const delete_confirmation_text = 'IWANTTODELETEMYACCOUNT';

	function open_delete_modal(): void {
		show_delete_modal = true;
		delete_confirmation = '';
	}

	function cancel_delete(): void {
		if (!is_deleting) {
			show_delete_modal = false;
			delete_confirmation = '';
		}
	}

	function raise_toast(message: string, type: 'success' | 'error' = 'success'): void {
		window.dispatchEvent(new CustomEvent('pigeon-toast', { detail: { message, type } }));
	}

	// Notification preference switches
	let showing_notif_prefs = $state(false);
	let saving_prefs = $state(false);
	// Deliberate snapshot of load-time prefs; edits go through ?/notification_prefs.
	const prefs = $state<Record<string, boolean>>(
		untrack(() => ({ ...data.prefs }))
	);

	const pref_rows: { key: string; label: string; description: string; icon: typeof Bell }[] = [
		{
			key: 'follow',
			label: 'Follows',
			description: 'Someone follows or follows you back.',
			icon: UserPlus
		},
		{
			key: 'like',
			label: 'Likes',
			description: 'Someone likes one of your posts.',
			icon: Heart
		},
		{
			key: 'dislike',
			label: 'Dislikes',
			description: 'Someone dislikes one of your posts.',
			icon: ThumbsDown
		},
		{
			key: 'repost',
			label: 'Reposts',
			description: 'Someone reposts one of your posts.',
			icon: Repeat2
		},
		{
			key: 'pigeon',
			label: 'Incoming pigeons',
			description: 'A friend releases a pigeon addressed to you. Content stays sealed until it lands.',
			icon: Bird
		}
	];

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
			icon: KeyRound,
			on_open: toggle_password_form
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
			icon: Bell,
			on_open: () => {
				showing_notif_prefs = !showing_notif_prefs;
			}
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
			kind: 'danger',
			on_open: open_delete_modal
		}
	];

	function open_action(item: ActionItem): void {
		item.on_open?.();
	}
</script>

<svelte:head>
	<title>Settings · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="settings">
		<header class="settings-header">
			<div class="settings-title-block">
				<h1 class="settings-title">Settings</h1>
				<p class="settings-sub">
					Manage your account, security, and preferences.
				</p>
			</div>
		</header>

		<div class="settings-grid" role="list">
			<section class="panel" aria-label="Home loft" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Home loft</h2>
					<p class="panel-sub">
						Where your pigeons fly from. Flight times are measured from here, so moving changes
						every distance.
					</p>
				</div>
				<div class="panel-body">
					<button
						class="action"
						type="button"
						aria-label="Update home loft"
						onclick={() => {
							showing_loft_gate = true;
						}}
					>
						<span class="action-left">
							<span class="action-icon" aria-hidden="true"><MapPin size={18} /></span>
							<span class="action-text">
								<span class="action-title">
									{data.home ? 'Update your loft' : 'Set your loft'}
								</span>
								<span class="action-desc">
									{#if data.home}
										{loft_coords_label}{loft_accuracy_label ? ` · ${loft_accuracy_label}` : ''}
									{:else}
										Not set yet. Pigeon post stays locked until you set it.
									{/if}
								</span>
							</span>
						</span>
						<span class="action-right">
							<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
						</span>
					</button>
					<p class="loft-privacy">
						Only you see these coordinates. Friends see the distance between you, and the flight map
						rounds every position to about a kilometre.
					</p>
				</div>
			</section>

			<section class="panel" aria-label="Account settings" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Account</h2>
					<p class="panel-sub">Email, connected accounts, and profile controls.</p>
				</div>
				<div class="panel-body">
					{#each account_actions as item (item.title)}
						<button class="action" type="button" aria-label={item.title} onclick={() => open_action(item)}>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								{#if !item.on_open}
									<span class="badge" aria-label="Coming soon">Soon</span>
								{/if}
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
						<button
							class="action"
							type="button"
							aria-label={item.title}
							aria-expanded={item.title === 'Change password' ? showing_password_form : undefined}
							onclick={() => open_action(item)}
						>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								{#if !item.on_open}
									<span class="badge" aria-label="Coming soon">Soon</span>
								{/if}
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}

					{#if showing_password_form}
						<form
							class="pw-form"
							method="POST"
							action="?/password"
							transition:fade={{ duration: 150 }}
							use:enhance={() => {
								return async ({ result, update }) => {
									if (result.type === 'success') {
										raise_toast(String(result.data?.message ?? 'Password updated successfully'));
										toggle_password_form();
										return;
									}
									if (result.type === 'failure') {
										raise_toast(
											String(result.data?.message ?? 'Failed to change password'),
											'error'
										);
										return;
									}
									await update();
								};
							}}
						>
							<div class="form-group">
								<label for="currentPassword">Current password</label>
								<input
									id="currentPassword"
									name="currentPassword"
									type="password"
									bind:value={current_password}
									required
									autocomplete="current-password"
								/>
							</div>

							<div class="form-group">
								<label for="newPassword">New password</label>
								<input
									id="newPassword"
									name="newPassword"
									type="password"
									bind:value={new_password}
									required
									minlength="8"
									autocomplete="new-password"
								/>
							</div>

							<div class="form-group">
								<label for="confirmPassword">Confirm new password</label>
								<input
									id="confirmPassword"
									name="confirmPassword"
									type="password"
									bind:value={confirm_password}
									required
									minlength="8"
									autocomplete="new-password"
								/>
								{#if confirm_password && confirm_password !== new_password}
									<span class="field-hint field-hint--error">Passwords do not match.</span>
								{/if}
							</div>

							<div class="pw-actions">
								<button type="button" class="btn-quiet" onclick={toggle_password_form}>
									Cancel
								</button>
								<button
									type="submit"
									class="btn-primary-pill"
									disabled={
										!current_password ||
										new_password.length < 8 ||
										new_password !== confirm_password ||
										current_password === new_password
									}
								>
									Update password
								</button>
							</div>
						</form>
					{/if}
				</div>
			</section>

			<section class="panel" aria-label="Preference settings" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Preferences</h2>
					<p class="panel-sub">Notifications, appearance, and other choices.</p>
				</div>
				<div class="panel-body">
					{#each preference_actions as item (item.title)}
						<button
							class="action"
							type="button"
							aria-label={item.title}
							aria-expanded={item.title === 'Notifications' ? showing_notif_prefs : undefined}
							onclick={() => open_action(item)}
						>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								{#if !item.on_open}
									<span class="badge" aria-label="Coming soon">Soon</span>
								{/if}
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}

					{#if showing_notif_prefs}
						<form
							class="pref-form"
							method="POST"
							action="?/notification_prefs"
							transition:fade={{ duration: 150 }}
							use:enhance={() => {
								saving_prefs = true;
								return async ({ result, update }) => {
									saving_prefs = false;
									if (result.type === 'success') {
										raise_toast('Notification settings saved.');
										return;
									}
									if (result.type === 'failure') {
										raise_toast(
											String(result.data?.message ?? 'Could not save settings'),
											'error'
										);
										return;
									}
									await update();
								};
							}}
						>
							{#each pref_rows as row (row.key)}
								<label class="pref-row">
									<span class="pref-icon" aria-hidden="true"><row.icon size={16} /></span>
									<span class="pref-text">
										<span class="pref-label">{row.label}</span>
										<span class="pref-desc">{row.description}</span>
									</span>
									<input
										class="pref-switch"
										type="checkbox"
										name={row.key}
										bind:checked={prefs[row.key]}
									/>
								</label>
							{/each}

							<div class="pw-actions">
								<button type="button" class="btn-quiet" onclick={() => (showing_notif_prefs = false)}>
									Close
								</button>
								<button type="submit" class="btn-primary-pill" disabled={saving_prefs}>
									{saving_prefs ? 'Saving...' : 'Save preferences'}
								</button>
							</div>
						</form>
					{/if}
				</div>
			</section>

			<section class="panel danger" aria-label="Danger zone" role="listitem">
				<div class="panel-head">
					<h2 class="panel-title">Danger zone</h2>
					<p class="panel-sub">Irreversible actions.</p>
				</div>
				<div class="panel-body">
					{#each danger_actions as item (item.title)}
						<button class="action danger-action" type="button" aria-label={item.title} onclick={() => open_action(item)}>
							<span class="action-left">
								<span class="action-icon" aria-hidden="true"><item.icon size={18} /></span>
								<span class="action-text">
									<span class="action-title">{item.title}</span>
									<span class="action-desc">{item.description}</span>
								</span>
							</span>
							<span class="action-right">
								<span class="chev" aria-hidden="true"><ChevronRight size={18} /></span>
							</span>
						</button>
					{/each}
				</div>
			</section>
		</div>
	</div>

	<!-- Delete Account Modal -->
	{#if show_delete_modal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-backdrop" onclick={cancel_delete}>
			<div class="modal-delete" onclick={(e) => e.stopPropagation()}>
				<form
					method="POST"
					action="?/delete"
					use:enhance={() => {
						is_deleting = true;
						return async ({ result }) => {
							if (result.type === 'success' && result.data?.deleted) {
								await auth_client.signOut();
								window.location.href = '/';
								return;
							}
							is_deleting = false;
							if (result.type === 'error' || result.type === 'failure') {
								show_delete_modal = false;
								raise_toast('Could not delete the account. Try again.', 'error');
							}
						};
					}}
				>
					<div class="modal-header-danger">
						<Trash2 size={20} />
						<h2>Delete Account</h2>
					</div>
					<div class="modal-body">
						<p>This action is <strong>irreversible</strong>. Deleting your account will:</p>
						<ul class="delete-consequences">
							<li>Remove your profile permanently</li>
							<li>Delete all your posts and data</li>
							<li>Take your pigeons out of the sky</li>
						</ul>
						<p>
							To confirm, type <code>{delete_confirmation_text}</code> in the field below:
						</p>
						<input
							type="text"
							name="deleteConfirmation"
							class="delete-input"
							placeholder="Type here..."
							bind:value={delete_confirmation}
							required
						/>
						{#if delete_confirmation && delete_confirmation !== delete_confirmation_text}
							<p class="delete-hint">
								{#if delete_confirmation.length < delete_confirmation_text.length}
									Keep typing...
								{:else}
									Confirmation text does not match
								{/if}
							</p>
						{/if}
					</div>
					<div class="modal-footer">
						<button type="button" class="btn-quiet" onclick={cancel_delete}>Cancel</button>
						<button
							type="submit"
							class="btn-danger-solid"
							disabled={delete_confirmation !== delete_confirmation_text || is_deleting}
						>
							Delete my account
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	<!-- Deleting Overlay -->
	{#if is_deleting}
		<div class="deleting-overlay">
			<div class="deleting-content">
				<Loader2 size={48} />
				<h2>Deleting account...</h2>
				<p>Setting things right. Please wait a moment.</p>
			</div>
		</div>
	{/if}

	{#if showing_loft_gate}
		<HomeLocationGate
			reason="Sharing your location again moves your loft. Every saved distance is recalculated, though pigeons already in the air keep their original arrival time."
			initial_coords={data.home ? { lat: data.home.lat, lng: data.home.lng } : undefined}
			on_saved={async () => {
				showing_loft_gate = false;
				await invalidateAll();
			}}
			on_dismiss={() => {
				showing_loft_gate = false;
			}}
		/>
	{/if}
{:else if !$session.isPending}
	<UnauthenticatedPrompt />
{:else}
	<main class="loading">
		<p>Loading...</p>
	</main>
{/if}

<style>
	.loft-privacy {
		margin: 0.75rem 0 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: #64748b;
	}

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
		background:
			radial-gradient(circle at 25% 20%, rgba(186, 230, 253, 0.65), transparent 55%),
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

	/* Inline change-password form */
	.pw-form {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin: 0.35rem 0.5rem 0.75rem;
		padding: 1rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 0.85rem;
		background: rgba(248, 250, 252, 0.75);
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.form-group label {
		font-size: 0.82rem;
		font-weight: 700;
		color: #0f172a;
	}

	.form-group input {
		font-family: inherit;
		font-size: 0.92rem;
		padding: 0.6rem 0.8rem;
		border-radius: 0.6rem;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}

	.form-group input:focus {
		outline: none;
		border-color: #0ea5e9;
		box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.18);
	}

	.field-hint {
		font-size: 0.78rem;
		color: #64748b;
	}

	.field-hint--error {
		color: #dc2626;
	}

	.pw-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.6rem;
		margin-top: 0.25rem;
	}

	.btn-quiet {
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.55rem 1rem;
		border-radius: 999px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #475569;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-quiet:hover {
		background: #f1f5f9;
	}

	.btn-primary-pill {
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.55rem 1.15rem;
		border-radius: 999px;
		border: none;
		background: linear-gradient(90deg, #38bdf8, #0284c7);
		color: #ffffff;
		cursor: pointer;
		box-shadow: 0 8px 18px rgba(2, 132, 199, 0.28);
		transition:
			filter 0.2s ease,
			transform 0.2s ease;
	}

	.btn-primary-pill:hover:not(:disabled) {
		filter: brightness(1.06);
		transform: translateY(-1px);
	}

	.btn-primary-pill:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		box-shadow: none;
	}

	/* Notification preference switches */
	.pref-form {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0.35rem 0.5rem 0.75rem;
		padding: 0.85rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
		border-radius: 0.85rem;
		background: rgba(248, 250, 252, 0.75);
	}

	.pref-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.5rem 0.4rem;
		border-radius: 0.6rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.pref-row:hover {
		background: rgba(226, 232, 240, 0.55);
	}

	.pref-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 0.7rem;
		border: 1px solid rgba(148, 163, 184, 0.35);
		color: #475569;
		flex: 0 0 auto;
	}

	.pref-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
		flex: 1;
	}

	.pref-label {
		font-size: 0.88rem;
		font-weight: 700;
		color: #0f172a;
	}

	.pref-desc {
		font-size: 0.78rem;
		line-height: 1.35;
		color: #64748b;
	}

	.pref-switch {
		appearance: none;
		width: 40px;
		height: 22px;
		border-radius: 999px;
		background: #cbd5e1;
		position: relative;
		cursor: pointer;
		flex: 0 0 auto;
		transition: background 0.2s ease;
	}

	.pref-switch::after {
		content: '';
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ffffff;
		box-shadow: 0 1px 3px rgba(15, 23, 42, 0.35);
		transition: transform 0.2s ease;
	}

	.pref-switch:checked {
		background: #0284c7;
	}

	.pref-switch:checked::after {
		transform: translateX(18px);
	}

	.pref-switch:focus-visible {
		outline: 2px solid rgba(59, 130, 246, 0.45);
		outline-offset: 2px;
	}

	.panel.danger {
		border-color: rgba(244, 63, 94, 0.25);
	}

	.danger-action .action-icon {
		border-color: rgba(244, 63, 94, 0.25);
		background:
			radial-gradient(circle at 25% 20%, rgba(254, 202, 202, 0.75), transparent 55%),
			linear-gradient(180deg, rgba(244, 63, 94, 0.08), rgba(15, 23, 42, 0.02));
	}

	/* -------------------------------------------------------------
	   DELETE ACCOUNT MODAL
	------------------------------------------------------------- */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(15, 23, 42, 0.6);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-delete {
		width: 100%;
		max-width: 500px;
		background: #ffffff;
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 30px 60px -12px rgba(15, 23, 42, 0.4);
		animation: modal-pop 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes modal-pop {
		from {
			opacity: 0;
			transform: translateY(-16px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.modal-header-danger {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 20px 24px;
		background-color: #fff8f8;
		border-bottom: 1px solid #ffcdd2;
		color: #dc2626;
	}

	.modal-header-danger h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 800;
		color: #0f172a;
	}

	.modal-body {
		padding: 24px;
	}

	.modal-body p {
		font-size: 14px;
		color: #64748b;
		margin: 0 0 12px;
		line-height: 1.5;
	}

	.modal-body p strong {
		color: #c62828;
	}

	.modal-body code {
		background-color: #f1f5f9;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 600;
		color: #0f172a;
	}

	.delete-consequences {
		margin: 12px 0;
		padding-left: 20px;
		font-size: 14px;
		color: #64748b;
	}

	.delete-consequences li {
		margin-bottom: 4px;
	}

	.delete-input {
		width: 100%;
		padding: 12px 16px;
		border-radius: 8px;
		border: 1px solid #cbd5e1;
		background-color: #f8fafc;
		font-family: inherit;
		font-size: 14px;
		transition: all 0.2s;
		box-sizing: border-box;
		color: #0f172a;
	}

	.delete-input:focus {
		outline: none;
		border-color: #dc2626;
		background-color: white;
		box-shadow: 0 0 0 1px #dc2626;
	}

	.delete-hint {
		font-size: 13px;
		color: #c62828;
		margin: 8px 0 0;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #e2e8f0;
	}

	.btn-danger-solid {
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		padding: 0.55rem 1.15rem;
		border-radius: 999px;
		border: none;
		background: #e11d48;
		color: #ffffff;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.btn-danger-solid:hover:not(:disabled) {
		background: #be123c;
	}

	.btn-danger-solid:disabled {
		background: #fecdd3;
		color: #9f1239;
		cursor: not-allowed;
	}

	.deleting-overlay {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
	}

	.deleting-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		color: #0f172a;
	}

	.deleting-content :global(svg) {
		color: #e11d48;
		animation: deleting-spin 1.4s linear infinite;
	}

	.deleting-content h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 800;
		letter-spacing: -0.025em;
	}

	.deleting-content p {
		margin: 0;
		color: #64748b;
		font-size: 1.05rem;
	}

	@keyframes deleting-spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
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
