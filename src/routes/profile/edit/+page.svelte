<script lang="ts">
	import { enhance } from '$app/forms';

	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Camera, KeyRound, Trash2, AlertTriangle } from 'lucide-svelte';
	import AvatarUploader from '$lib/components/AvatarUploader.svelte';

	const { data, form } = $props<{ data: PageData; form: ActionData }>();

	const profile = $state((() => ({ ...data.profile }))());
	let active_tab = $state<'profile' | 'security'>('profile');

	// Avatar uploader
	let show_avatar_uploader = $state(false);

	function handle_avatar_success(newUrl: string) {
		profile.avatar = newUrl;
		show_avatar_uploader = false;
	}

	// Security tab state
	let show_password_form = $state(false);

	// Password form state
	let current_password = $state('');
	let new_password = $state('');
	let confirm_password = $state('');
	let password_error = $state('');

	function handle_password_submit() {
		password_error = '';

		if (new_password !== confirm_password) {
			password_error = "Your passwords don't match";
			return;
		}

		if (current_password === new_password) {
			password_error = 'Cannot change into the same password';
			return;
		}
	}

	// Delete account state
	let show_delete_modal = $state(false);
	let delete_confirmation = $state('');
	const delete_confirmation_text = 'IWANTTODELETEMYACCOUNT';

	function open_delete_modal() {
		show_delete_modal = true;
		delete_confirmation = '';
	}

	function cancel_delete() {
		show_delete_modal = false;
		delete_confirmation = '';
	}
</script>

<svelte:head>
	<title>Edit Profile · Pigeon</title>
</svelte:head>

<div class="edit-layout">
	<div class="main-column border-x">
		<div class="header">
			<a href={resolve('/profile')} class="back-btn" aria-label="Back to profile">
				<ArrowLeft size={20} />
			</a>
			<h1 class="page-title">Edit profile</h1>
		</div>

		<div class="tabs">
			<button
				class="tab"
				class:active={active_tab === 'profile'}
				onclick={() => (active_tab = 'profile')}
			>
				Profile Information
				{#if active_tab === 'profile'}
					<div class="tab-indicator"></div>
				{/if}
			</button>
			<button
				class="tab"
				class:active={active_tab === 'security'}
				onclick={() => (active_tab = 'security')}
			>
				Security
				{#if active_tab === 'security'}
					<div class="tab-indicator"></div>
				{/if}
			</button>
		</div>

		{#if form?.message}
			<div class="alert" class:success={form?.success} class:error={!form?.success}>
				{form.message}
			</div>
		{/if}

		<div class="form-container">
			{#if active_tab === 'profile'}
				<form method="POST" action="?/profile" use:enhance class="edit-form">
					<!-- Avatar Edit -->
					<div class="avatar-section">
						<span class="section-label">Profile Picture</span>
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="avatar-container" onclick={() => (show_avatar_uploader = true)}>
							<img
								src={profile.avatar || 'https://ui-avatars.com/api/?name=' + profile.name}
								alt="Avatar"
								class="avatar-image"
							/>
							<div class="avatar-overlay">
								<Camera size={24} />
							</div>
						</div>
					</div>

					<div class="form-group">
						<label for="name">Name</label>
						<input
							type="text"
							id="name"
							name="name"
							bind:value={profile.name}
							maxlength="50"
							required
						/>
					</div>

					<div class="form-group">
						<label for="username">Username</label>
						<div class="input-with-prefix">
							<span class="prefix">@</span>
							<input
								type="text"
								id="username"
								name="username"
								bind:value={profile.username}
								pattern="[a-zA-Z0-9_]+"
								title="Only letters, numbers, and underscores are allowed"
								maxlength="15"
								required
							/>
						</div>
					</div>

					<div class="form-group">
						<label for="bio">Bio</label>
						<textarea id="bio" name="bio" bind:value={profile.bio} rows="4" maxlength="160"
						></textarea>
						<div class="char-count">{(profile.bio || '').length} / 160</div>
					</div>

					<div class="form-actions">
						<button type="submit" class="btn btn-primary">Save changes</button>
					</div>
				</form>
			{:else if show_password_form}
				<div class="security-section">
					<button class="security-back-btn" onclick={() => (show_password_form = false)}>
						<ArrowLeft size={16} /> Back to Security
					</button>

					<form
						method="POST"
						action="?/password"
						use:enhance
						onsubmit={handle_password_submit}
						class="edit-form"
					>
						<div class="security-intro">
							<KeyRound size={20} />
							<p>Update your password to keep your account secure.</p>
						</div>

						{#if password_error}
							<div class="alert error">{password_error}</div>
						{/if}

						<div class="form-group">
							<label for="currentPassword">Current password</label>
							<input
								type="password"
								id="currentPassword"
								name="currentPassword"
								bind:value={current_password}
								required
							/>
						</div>

						<div class="form-group">
							<label for="newPassword">New password</label>
							<input
								type="password"
								id="newPassword"
								name="newPassword"
								bind:value={new_password}
								required
								minlength="8"
							/>
						</div>

						<div class="form-group">
							<label for="confirmPassword">Confirm new password</label>
							<input
								type="password"
								id="confirmPassword"
								name="confirmPassword"
								bind:value={confirm_password}
								required
								minlength="8"
							/>
						</div>

						<div class="form-actions">
							<button type="submit" class="btn btn-primary">Update password</button>
						</div>
					</form>
				</div>
			{:else}
				<div class="security-options">
					<div class="security-option">
						<div class="security-option-content">
							<KeyRound size={24} />
							<div class="security-option-text">
								<h3>Change Password</h3>
								<p>Update your password to keep your account secure</p>
							</div>
						</div>
						<button class="btn btn-outline" onclick={() => (show_password_form = true)}>
							Change
						</button>
					</div>

					<div class="security-option danger">
						<div class="security-option-content">
							<AlertTriangle size={24} />
							<div class="security-option-text">
								<h3>Delete Account</h3>
								<p>Permanently delete your account and all your data</p>
							</div>
						</div>
						<button class="btn btn-danger" onclick={open_delete_modal}> Delete </button>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Avatar Uploader Modal -->
	{#if show_avatar_uploader}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-backdrop" onclick={() => (show_avatar_uploader = false)}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<AvatarUploader
					current_avatar_url={profile.avatar}
					on_success={handle_avatar_success}
					on_close={() => (show_avatar_uploader = false)}
				/>
			</div>
		</div>
	{/if}

	<!-- Delete Account Modal -->
	{#if show_delete_modal}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-backdrop" onclick={cancel_delete}>
			<div class="modal-content modal-delete" onclick={(e) => e.stopPropagation()}>
				<form method="POST" action="?/delete" use:enhance>
					<div class="modal-header danger">
						<Trash2 size={20} />
						<h2>Delete Account</h2>
					</div>
					<div class="modal-body">
						<p>This action is <strong>irreversible</strong>. Deleting your account will:</p>
						<ul class="delete-consequences">
							<li>Remove your profile permanently</li>
							<li>Delete all your posts and data</li>
							<li>Remove you from all notifications</li>
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
						<button type="button" class="btn btn-outline" onclick={cancel_delete}> Cancel </button>
						<button
							type="submit"
							class="btn btn-danger"
							disabled={delete_confirmation !== delete_confirmation_text}
						>
							Delete my account
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	.edit-layout {
		min-height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	.main-column {
		width: 100%;
		max-width: 600px;
		min-height: 100%;
		background-color: white;
	}

	.border-x {
		border-left: 1px solid #e1e8ed;
		border-right: 1px solid #e1e8ed;
	}

	.header {
		display: flex;
		align-items: center;
		padding: 0 16px;
		height: 53px;
		border-bottom: 1px solid #e1e8ed;
		position: sticky;
		top: 0;
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(12px);
		z-index: 10;
	}

	.back-btn {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #14171a;
		margin-right: 16px;
		transition: background-color 0.2s;
	}

	.back-btn:hover {
		background-color: #f5f8fa;
	}

	.page-title {
		font-size: 20px;
		font-weight: 800;
		color: #14171a;
		margin: 0;
	}

	.tabs {
		display: flex;
		border-bottom: 1px solid #e1e8ed;
	}

	.tab {
		flex: 1;
		background: transparent;
		border: none;
		font-weight: 500;
		font-size: 15px;
		color: #657786;
		padding: 16px 0;
		cursor: pointer;
		position: relative;
		transition: background-color 0.2s;
		font-family: inherit;
	}

	.tab:hover {
		background-color: #f5f8fa;
	}

	.tab.active {
		font-weight: 700;
		color: #14171a;
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 56px;
		height: 4px;
		border-radius: 9999px;
		background-color: #1da1f2;
	}

	.alert {
		padding: 12px 16px;
		margin: 16px;
		border-radius: 8px;
		font-size: 15px;
	}

	.success {
		background-color: #e8f5e9;
		color: #2e7d32;
		border: 1px solid #c8e6c9;
	}

	.error {
		background-color: #ffebee;
		color: #c62828;
		border: 1px solid #ffcdd2;
	}

	.form-container {
		padding: 16px;
	}

	.edit-form {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.avatar-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-label {
		font-size: 15px;
		font-weight: 700;
		color: #14171a;
	}

	.avatar-container {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background-color: #f5f8fa;
		overflow: hidden;
		position: relative;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 0 0 1px #e1e8ed;
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.avatar-container:hover .avatar-overlay {
		opacity: 1;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	label {
		font-size: 15px;
		font-weight: 700;
		color: #14171a;
	}

	input[type='text'],
	input[type='password'],
	textarea {
		font-family: inherit;
		font-size: 15px;
		padding: 12px 16px;
		border-radius: 8px;
		border: 1px solid #e1e8ed;
		background-color: #f5f8fa;
		color: #14171a;
		transition: all 0.2s;
	}

	input[type='text']:focus,
	input[type='password']:focus,
	textarea:focus {
		outline: none;
		border-color: #1da1f2;
		background-color: white;
		box-shadow: 0 0 0 1px #1da1f2;
	}

	.input-with-prefix {
		position: relative;
		display: flex;
		align-items: center;
	}

	.prefix {
		position: absolute;
		left: 16px;
		color: #657786;
		pointer-events: none;
		font-size: 15px;
	}

	.input-with-prefix input {
		padding-left: 36px;
		width: 100%;
		box-sizing: border-box;
	}

	textarea {
		resize: vertical;
		min-height: 96px;
		box-sizing: border-box;
	}

	.char-count {
		font-size: 13px;
		color: #657786;
		text-align: right;
	}

	.security-intro {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		background-color: #f5f8fa;
		border-radius: 8px;
		color: #657786;
		font-size: 15px;
	}

	.security-intro :global(svg) {
		color: #14171a;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid #e1e8ed;
	}

	.btn {
		cursor: pointer;
		font-family: inherit;
		font-weight: 700;
		font-size: 15px;
		padding: 0 24px;
		min-height: 44px;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s;
		border: none;
	}

	.btn-primary {
		background-color: #1da1f2;
		color: white;
	}

	.btn-primary:hover {
		background-color: #1a91da;
	}

	.btn-primary:active {
		background-color: #167cb8;
	}

	.btn-outline {
		background-color: transparent;
		color: #1da1f2;
		border: 2px solid #1da1f2;
	}

	.btn-outline:hover {
		background-color: #f0f8ff;
	}

	.btn-danger {
		background-color: #dc3545;
		color: white;
	}

	.btn-danger:hover {
		background-color: #c82333;
	}

	.btn-danger:active {
		background-color: #bd2130;
	}

	.btn-danger:disabled {
		background-color: #f5c6cb;
		color: #6c757d;
		cursor: not-allowed;
	}

	@media (max-width: 600px) {
		.border-x {
			border-left: none;
			border-right: none;
		}
	}

	/* Modal Styles */
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		position: relative;
		max-width: 500px;
		width: 100%;
		animation: modalSlideIn 0.3s ease-out;
	}

	@keyframes modalSlideIn {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Security Options */
	.security-section {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}

	.security-back-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: none;
		color: #657786;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
		padding: 8px 0;
		transition: color 0.2s;
	}

	.security-back-btn:hover {
		color: #14171a;
	}

	.security-options {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.security-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px;
		border-radius: 12px;
		border: 1px solid #e1e8ed;
		background-color: #f5f8fa;
	}

	.security-option.danger {
		border-color: #ffcdd2;
		background-color: #fff8f8;
	}

	.security-option-content {
		display: flex;
		align-items: center;
		gap: 16px;
		color: #657786;
		flex: 1;
	}

	.security-option.danger .security-option-content {
		color: #c62828;
	}

	.security-option-text h3 {
		font-size: 15px;
		font-weight: 700;
		color: #14171a;
		margin: 0 0 2px;
	}

	.security-option.danger .security-option-text h3 {
		color: #c62828;
	}

	.security-option-text p {
		font-size: 13px;
		color: #657786;
		margin: 0;
	}

	.security-option.danger .security-option-text p {
		color: #a94442;
	}

	/* Delete Modal */
	.modal-delete {
		background-color: white;
		border-radius: 16px;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 20px 24px;
		background-color: #f5f8fa;
		border-bottom: 1px solid #e1e8ed;
	}

	.modal-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 800;
		color: #14171a;
	}

	.modal-header.danger {
		background-color: #fff8f8;
		border-bottom-color: #ffcdd2;
	}

	.modal-header.danger :global(svg) {
		color: #dc3545;
	}

	.modal-body {
		padding: 24px;
	}

	.modal-body p {
		font-size: 14px;
		color: #657786;
		margin: 0 0 12px;
		line-height: 1.5;
	}

	.modal-body p strong {
		color: #c62828;
	}

	.modal-body code {
		background-color: #f5f8fa;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 13px;
		font-weight: 600;
		color: #14171a;
	}

	.delete-consequences {
		margin: 12px 0;
		padding-left: 20px;
		font-size: 14px;
		color: #657786;
	}

	.delete-consequences li {
		margin-bottom: 4px;
	}

	.delete-input {
		width: 100%;
		padding: 12px 16px;
		border-radius: 8px;
		border: 1px solid #e1e8ed;
		background-color: #f5f8fa;
		font-family: inherit;
		font-size: 14px;
		transition: all 0.2s;
		box-sizing: border-box;
	}

	.delete-input:focus {
		outline: none;
		border-color: #dc3545;
		background-color: white;
		box-shadow: 0 0 0 1px #dc3545;
	}

	.delete-hint {
		font-size: 13px !important;
		color: #c62828 !important;
		margin-top: 8px !important;
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		padding: 16px 24px;
		border-top: 1px solid #e1e8ed;
	}
</style>
