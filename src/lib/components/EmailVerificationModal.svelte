<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { Mail, ArrowLeft, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-svelte';
	import { auth_client } from '$lib/auth-client';

	const { email, on_verified } = $props<{
		email: string;
		on_verified: () => void;
	}>();

	type VerificationState = 'prompt' | 'code' | 'change-email' | 'success';
	let current_state = $state<VerificationState>('prompt');
	let code = $state(['', '', '', '', '', '']);
	// svelte-ignore state_referenced_locally
	let new_email = $state(email);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let resend_cooldown = $state(0);
	let resend_timer: ReturnType<typeof setInterval> | undefined;

	const inputs = $state<HTMLInputElement[]>([]);

	function handle_input(i: number, e: Event) {
		const target = e.target as HTMLInputElement;
		const val = target.value;
		
		if (val.length > 1) {
			// Handle paste
			const digits = val.slice(0, 6).split('');
			digits.forEach((d, idx) => {
				if (i + idx < 6) code[i + idx] = d;
			});
			const next_idx = Math.min(i + digits.length, 5);
			inputs[next_idx]?.focus();
		} else {
			code[i] = val;
			if (val && i < 5) {
				inputs[i + 1]?.focus();
			}
		}
	}

	function handle_key_down(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !code[i] && i > 0) {
			inputs[i - 1]?.focus();
		}
	}

	async function send_code() {
		loading = true;
		error = null;
		try {
			const res = await fetch('/api/verification', { method: 'POST' });
			if (!res.ok) throw new Error('Failed to send code');
			current_state = 'code';
			start_resend_timer();
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	async function verify_code() {
		const full_code = code.join('');
		if (full_code.length !== 6) return;

		loading = true;
		error = null;
		try {
			const res = await fetch('/api/verification', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code: full_code })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Invalid code');
			
			current_state = 'success';
			setTimeout(() => {
				on_verified();
			}, 1500);
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : String(err);
			code = ['', '', '', '', '', ''];
			inputs[0]?.focus();
		} finally {
			loading = false;
		}
	}

	async function change_email() {
		if (!new_email || !new_email.includes('@')) {
			error = 'Please enter a valid email address';
			return;
		}

		loading = true;
		error = null;
		try {
			const res = await fetch('/api/verification', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: new_email })
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to update email');
			
			current_state = 'code';
			start_resend_timer();
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			loading = false;
		}
	}

	function start_resend_timer() {
		resend_cooldown = 60;
		if (resend_timer) clearInterval(resend_timer);
		resend_timer = setInterval(() => {
			resend_cooldown--;
			if (resend_cooldown <= 0) clearInterval(resend_timer);
		}, 1000);
	}

	async function handle_sign_out() {
		try {
			await auth_client.signOut();
			window.location.href = '/';
		} catch (err) {
			console.error('Sign out failed:', err);
			window.location.href = '/';
		}
	}

	$effect(() => {
		if (current_state === 'code' && inputs[0]) {
			setTimeout(() => inputs[0].focus(), 100);
		}
	});

	onMount(() => {
		return () => {
			if (resend_timer) clearInterval(resend_timer);
		};
	});
</script>

<div class="modal-root" transition:fade={{ duration: 200 }}>
	<div class="backdrop"></div>
	
	<div class="panel" transition:scale={{ duration: 300, start: 0.95, opacity: 0 }}>
		<div class="content">
			{#if current_state === 'prompt'}
				<div class="icon-circle">
					<Mail size={32} class="icon" />
				</div>
				<h2>Verify your email</h2>
				<p>Your account is currently unverified. Please verify your email to unlock all features.</p>
				<p class="email-display"><strong>{email}</strong></p>
 
				<div class="actions">
					<button class="btn-primary" onclick={send_code} disabled={loading}>
						{loading ? 'Sending...' : 'Verify now'}
					</button>
					<button class="btn-text" onclick={() => current_state = 'change-email'}>
						Change email address
					</button>
					<button class="btn-ghost" onclick={handle_sign_out}>
						Back to Login
					</button>
				</div>
			{:else if current_state === 'code'}
				<button class="back-btn" onclick={() => current_state = 'prompt'}>
					<ArrowLeft size={20} />
				</button>
				<h2>Enter verification code</h2>
				<p>We sent a 6-digit code to <strong>{new_email}</strong>. Enter it below to verify.</p>
 
				<div class="code-inputs">
					{#each code as digit, i (i)}
						<input
							bind:this={inputs[i]}
							type="text"
							maxlength="6"
							inputmode="numeric"
							pattern="[0-9]*"
							value={digit}
							oninput={(e) => handle_input(i, e)}
							onkeydown={(e) => handle_key_down(i, e)}
							disabled={loading}
						/>
					{/each}
				</div>
 
				{#if error}
					<p class="error-msg"><AlertCircle size={14} /> {error}</p>
				{/if}
 
				<div class="actions">
					<button class="btn-primary" onclick={verify_code} disabled={loading || code.join('').length !== 6}>
						{loading ? 'Verifying...' : 'Verify code'}
					</button>
					<div class="resend-info">
						{#if resend_cooldown > 0}
							<p>Resend code in {resend_cooldown}s</p>
						{:else}
							<button class="btn-text" onclick={send_code} disabled={loading}>
								<RefreshCw size={14} /> Resend code
							</button>
						{/if}
					</div>
				</div>
			{:else if current_state === 'change-email'}
				<button class="back-btn" onclick={() => current_state = 'prompt'}>
					<ArrowLeft size={20} />
				</button>
				<h2>Change email</h2>
				<p>Enter the new email address you'd like to use for your account.</p>
 
				<div class="input-group">
					<label for="new-email">New Email Address</label>
					<input
						id="new-email"
						type="email"
						bind:value={new_email}
						placeholder="name@example.com"
						disabled={loading}
					/>
				</div>
 
				{#if error}
					<p class="error-msg"><AlertCircle size={14} /> {error}</p>
				{/if}
 
				<div class="actions">
					<button class="btn-primary" onclick={change_email} disabled={loading || !new_email}>
						{loading ? 'Updating...' : 'Update and send code'}
					</button>
				</div>
			{:else if current_state === 'success'}
				<div class="icon-circle success">
					<CheckCircle2 size={48} class="icon" />
				</div>
				<h2>Verified!</h2>
				<p>Your email has been successfully verified. Enjoy Pigeon!</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-root {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgba(8, 12, 20, 0.6);
		backdrop-filter: blur(8px);
	}

	.panel {
		position: relative;
		width: 100%;
		max-width: 440px;
		background: #ffffff;
		border-radius: 24px;
		padding: 2.5rem 2rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		text-align: center;
	}

	.back-btn {
		position: absolute;
		top: 1.5rem;
		left: 1.5rem;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		border: 1px solid #e2e8f0;
		background: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #64748b;
		cursor: pointer;
		transition: all 0.2s;
	}

	.back-btn:hover {
		background: #f8fafc;
		color: #0f172a;
		border-color: #cbd5e1;
	}

	.icon-circle {
		width: 80px;
		height: 80px;
		background: #f0f9ff;
		color: #0ea5e9;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0 auto 1.5rem;
	}

	.icon-circle.success {
		background: #f0fdf4;
		color: #22c55e;
	}

	h2 {
		font-size: 1.5rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0 0 0.75rem;
		letter-spacing: -0.025em;
	}

	p {
		color: #64748b;
		line-height: 1.6;
		margin: 0 0 1.5rem;
	}

	.email-display {
		background: #f8fafc;
		padding: 0.75rem;
		border-radius: 12px;
		color: #0f172a;
		margin-bottom: 2rem;
	}

	.actions {
		display: grid;
		gap: 0.75rem;
	}

	.btn-primary {
		width: 100%;
		padding: 0.875rem;
		background: #1da1f2;
		color: #fff;
		border: none;
		border-radius: 14px;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1a91da;
		transform: translateY(-1px);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-text {
		background: none;
		border: none;
		color: #1da1f2;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn-text:hover {
		text-decoration: underline;
	}

	.btn-ghost {
		background: #f1f5f9;
		color: #64748b;
		border: none;
		padding: 0.75rem;
		border-radius: 12px;
		font-weight: 600;
		cursor: pointer;
	}

	.code-inputs {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.code-inputs input {
		width: 48px;
		height: 56px;
		text-align: center;
		font-size: 1.5rem;
		font-weight: 800;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		color: #0f172a;
		outline: none;
		transition: all 0.2s;
	}

	.code-inputs input:focus {
		border-color: #1da1f2;
		background: #f0f9ff;
		box-shadow: 0 0 0 4px rgba(29, 161, 242, 0.1);
	}

	.input-group {
		text-align: left;
		margin-bottom: 1.5rem;
	}

	.input-group label {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: #475569;
		margin-bottom: 0.5rem;
	}

	.input-group input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 2px solid #e2e8f0;
		border-radius: 12px;
		outline: none;
		font-size: 1rem;
	}

	.input-group input:focus {
		border-color: #1da1f2;
	}

	.error-msg {
		color: #ef4444;
		font-size: 0.875rem;
		margin-top: -0.5rem;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
	}

	.resend-info {
		margin-top: 0.5rem;
		color: #94a3b8;
		font-size: 0.875rem;
	}
</style>
