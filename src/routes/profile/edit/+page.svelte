<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { ArrowLeft, Camera, Lock } from 'lucide-svelte';
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

	// Password form state
	let current_password = $state('');
	let new_password = $state('');
	let confirm_password = $state('');
	let password_error = $state('');

	function handle_password_submit() {
		password_error = '';

		if (new_password !== confirm_password) {
			password_error = 'Your passwords don\'t match';
			return;
		}

		if (current_password === new_password) {
			password_error = 'Cannot change into the same password';
			return;
		}
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
							<img src={profile.avatar || 'https://ui-avatars.com/api/?name=' + profile.name} alt="Avatar" class="avatar-image" />
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
						<textarea
							id="bio"
							name="bio"
							bind:value={profile.bio}
							rows="4"
							maxlength="160"
						></textarea>
						<div class="char-count">{(profile.bio || '').length} / 160</div>
					</div>

					<div class="form-actions">
						<button type="submit" class="btn btn-primary">Save changes</button>
					</div>
				</form>
			{:else}
				<form
					method="POST"
					action="?/password"
					use:enhance
					onsubmit={handle_password_submit}
					class="edit-form"
				>
					<div class="security-intro">
						<Lock size={20} />
						<p>Update your password to keep your account secure.</p>
					</div>

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
</div>

<style>
	.edit-layout {
		min-height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	.main-column {
		width: 100%;
		max-width: 600px;
		min-height: 100%;
		background-color: white;
	}

	.border-x {
		border-left: 1px solid #E1E8ED;
		border-right: 1px solid #E1E8ED;
	}

	.header {
		display: flex;
		align-items: center;
		padding: 0 16px;
		height: 53px;
		border-bottom: 1px solid #E1E8ED;
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
		color: #14171A;
		margin-right: 16px;
		transition: background-color 0.2s;
	}

	.back-btn:hover {
		background-color: #F5F8FA;
	}

	.page-title {
		font-size: 20px;
		font-weight: 800;
		color: #14171A;
		margin: 0;
	}

	.tabs {
		display: flex;
		border-bottom: 1px solid #E1E8ED;
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
		background-color: #F5F8FA;
	}

	.tab.active {
		font-weight: 700;
		color: #14171A;
	}

	.tab-indicator {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 56px;
		height: 4px;
		border-radius: 9999px;
		background-color: #1DA1F2;
	}

	.alert {
		padding: 12px 16px;
		margin: 16px;
		border-radius: 8px;
		font-size: 15px;
	}

	.success {
		background-color: #E8F5E9;
		color: #2E7D32;
		border: 1px solid #C8E6C9;
	}

	.error {
		background-color: #FFEBEE;
		color: #C62828;
		border: 1px solid #FFCDD2;
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
		color: #14171A;
	}

	.avatar-container {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background-color: #F5F8FA;
		overflow: hidden;
		position: relative;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 0 0 1px #E1E8ED;
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
		color: #14171A;
	}

	input[type="text"],
	input[type="password"],
	textarea {
		font-family: inherit;
		font-size: 15px;
		padding: 12px 16px;
		border-radius: 8px;
		border: 1px solid #E1E8ED;
		background-color: #F5F8FA;
		color: #14171A;
		transition: all 0.2s;
	}

	input[type="text"]:focus,
	input[type="password"]:focus,
	textarea:focus {
		outline: none;
		border-color: #1DA1F2;
		background-color: white;
		box-shadow: 0 0 0 1px #1DA1F2;
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
		background-color: #F5F8FA;
		border-radius: 8px;
		color: #657786;
		font-size: 15px;
	}

	.security-intro :global(svg) {
		color: #14171A;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		margin-top: 8px;
		padding-top: 16px;
		border-top: 1px solid #E1E8ED;
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
		background-color: #1DA1F2;
		color: white;
	}

	.btn-primary:hover {
		background-color: #1A91DA;
	}

    .btn-primary:active {
		background-color: #167CB8;
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
</style>
