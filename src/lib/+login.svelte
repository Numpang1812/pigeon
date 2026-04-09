<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import SsoButton from '$lib/components/SsoButton.svelte';
	import { auth_client } from '$lib/auth-client';

	let email = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);
	let lockout_time = $state<Date | null>(null);
	let lockout_countdown = $state<string>('');

	// Update lockout countdown every second
	let countdown_interval: ReturnType<typeof setInterval> | null = null;

	$effect(() => {
		if (lockout_time) {
			const active_lockout_time = lockout_time;
			countdown_interval = setInterval(() => {
				const now = new Date();
				const diff = active_lockout_time.getTime() - now.getTime();

				if (diff <= 0) {
					lockout_time = null;
					lockout_countdown = '';
					if (countdown_interval) clearInterval(countdown_interval);
				} else {
					const minutes = Math.floor(diff / 60000);
					const seconds = Math.floor((diff % 60000) / 1000);
					lockout_countdown = `${minutes}m ${seconds}s`;
				}
			}, 1000);
		}
	});

	async function handle_submit(e: SubmitEvent) {
		e.preventDefault();
		error = null;
		loading = true;

		try {
			const { error: auth_error } = await auth_client.signIn.email({
				email: email,
				password: password,
				callbackURL: resolve('/home')
			});

			if (auth_error) {
				const message = auth_error.message || '';
				const lockout_match = message.match(/^LOCKOUT\|(.+)$/);

				if (!lockout_match) {
					// Non-lockout error: clear lockout state
					lockout_time = null;
					lockout_countdown = '';
					throw new Error(message || 'Login failed. Please try again.');
				}

				const lockout_date = new Date(lockout_match[1]);

				// Only set lockoutTime if not already locked (prevents countdown reset)
				if (!lockout_time || lockout_time <= new Date()) {
					lockout_time = lockout_date;
				}
				error = `Account locked due to too many failed attempts.`;
			} else {
				goto(resolve('/home'));
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed. Please try again.';
		} finally {
			loading = false;
		}
	}

	async function handle_google_sso() {
		const { error } = await auth_client.signIn.social({
			provider: 'google',
			callbackURL: resolve('/home')
		});
		if (error) {
			console.error(error);
		}
	}

	async function handle_github_sso() {
		const { error } = await auth_client.signIn.social({
			provider: 'github',
			callbackURL: resolve('/home')
		});
		if (error) {
			console.error(error);
		}
	}
</script>

<svelte:head>
	<title>Log in · Pigeon</title>
	<meta name="description" content="Log in to Pigeon, the minimalist microblogging platform." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap"
	/>
</svelte:head>

<main class="login-root">
	<!-- Left panel – branding -->
	<section class="brand-panel" aria-hidden="true">
		<div class="brand-content">
			<!-- Pigeon silhouette logo -->
			<svg
				class="pigeon-logo"
				viewBox="0 0 120 120"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				aria-label="Pigeon logo"
			>
				<!-- Body -->
				<ellipse cx="62" cy="68" rx="34" ry="26" fill="white" opacity="0.95" />
				<!-- Head -->
				<circle cx="90" cy="48" r="18" fill="white" opacity="0.95" />
				<!-- Eye -->
				<circle cx="96" cy="44" r="3.5" fill="#1DA1F2" />
				<circle cx="97" cy="43" r="1.2" fill="white" />
				<!-- Beak -->
				<path d="M106 47 L116 50 L106 53 Z" fill="#0D8AEF" stroke="white" stroke-width="0.5" />
				<!-- Wing -->
				<path
					d="M68 70 Q50 75 39 60 Q70 45 82 65"
					stroke="#1DA1F2"
					stroke-width="2"
					stroke-linecap="round"
					fill="none"
					opacity="0.5"
				/>
				<!-- Tail feathers -->
				<path d="M30 78 Q20 90 14 100 Q26 88 32 82" fill="white" opacity="0.6" />
				<path d="M34 82 Q26 95 22 108 Q32 94 38 86" fill="white" opacity="0.5" />

				<!-- Feet -->
				<line
					x1="56"
					y1="92"
					x2="58"
					y2="101"
					stroke="white"
					stroke-width="3"
					stroke-linecap="round"
					opacity="0.7"
				/>
				<line
					x1="66"
					y1="93"
					x2="68"
					y2="102"
					stroke="white"
					stroke-width="3"
					stroke-linecap="round"
					opacity="0.7"
				/>
			</svg>

			<h1 class="brand-headline">Happening now.</h1>
			<p class="brand-sub">Join the flock. Share in seconds.</p>
		</div>

		<!-- Decorative floating circles -->
		<div class="decor decor-1"></div>
		<div class="decor decor-2"></div>
		<div class="decor decor-3"></div>
	</section>

	<!-- Right panel – login form -->
	<section class="form-panel">
		<div class="form-card">
			<!-- Mobile logo -->
			<div class="mobile-logo" aria-hidden="true">
				<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
					<!-- Body -->
					<ellipse cx="20" cy="24" rx="13" ry="10" fill="#1DA1F2" />

					<!-- Head -->
					<circle cx="30" cy="14" r="8" fill="#1DA1F2" />

					<!-- Eye -->
					<circle cx="33" cy="12" r="2.5" fill="white" />
					<circle cx="34" cy="11.2" r="1.2" fill="#1DA1F2" />

					<!-- Beak -->
					<path
						d="M36 14 L42 16 L36 18 Z"
						fill="white"
						stroke="#1DA1F2"
						stroke-width="1"
						stroke-linejoin="round"
					/>

					<!-- Wing (same shape) -->
					<path
						d="M68 70 Q30 75 20 60 Q70 45 80 65"
						stroke="white"
						stroke-width="2"
						stroke-linecap="round"
						fill="none"
						opacity="0.8"
						transform="scale(0.3) translate(15,10)"
					/>

					<!-- Tail feathers -->
					<path d="M11 26 Q6 30 4 34 Q10 30 12 27" fill="#1DA1F2" opacity="0.6" />
					<path d="M13 28 Q8 33 6 38 Q12 33 14 29" fill="#1DA1F2" opacity="0.5" />

					<!-- Feet -->
					<line
						x1="18"
						y1="32"
						x2="19"
						y2="37"
						stroke="#1DA1F2"
						stroke-width="2"
						stroke-linecap="round"
						opacity="0.7"
					/>
					<line
						x1="22"
						y1="32"
						x2="23"
						y2="37"
						stroke="#1DA1F2"
						stroke-width="2"
						stroke-linecap="round"
						opacity="0.7"
					/>
				</svg>
			</div>

			<h2 class="form-title">Sign in to Pigeon</h2>

			{#if error}
				<div class="alert alert-error" role="alert">
					<svg viewBox="0 0 20 20" fill="currentColor" class="alert-icon">
						<path
							fill-rule="evenodd"
							d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
							clip-rule="evenodd"
						/>
					</svg>
					<div class="alert-content">
						<div class="alert-message">{error}</div>
						{#if lockout_time}
							<div class="alert-countdown">
								<svg viewBox="0 0 20 20" fill="currentColor" class="alert-countdown-icon">
									<path
										fill-rule="evenodd"
										d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
										clip-rule="evenodd"
									/>
								</svg>
								Try again in {lockout_countdown}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<form id="login-form" onsubmit={handle_submit} novalidate>
				<div class="field">
					<label for="email" class="field-label">Email</label>
					<input
						id="email"
						type="email"
						class="field-input"
						placeholder="example@mail.com"
						autocomplete="email"
						required
						disabled={loading}
						bind:value={email}
					/>
				</div>

				<div class="field">
					<label for="password" class="field-label">Password</label>
					<input
						id="password"
						type="password"
						class="field-input"
						placeholder="••••••••"
						autocomplete="current-password"
						required
						disabled={loading}
						bind:value={password}
					/>
				</div>

				<a href={resolve('/')} class="forgot-link">Forgot password?</a>

				<button
					id="login-submit"
					type="submit"
					class="btn-primary"
					disabled={loading || !email || !password}
				>
					{#if loading}
						<span class="spinner" aria-hidden="true"></span>
						Signing in…
					{:else}
						Sign in
					{/if}
				</button>
			</form>

			<div class="divider"><span>or</span></div>

			<SsoButton provider="google" onclick={handle_google_sso} />
			<SsoButton provider="github" onclick={handle_github_sso} />

			<p class="signup-prompt">
				Don't have an account?
				<a href={resolve('/signup')} class="signup-link">Sign up</a>
			</p>
		</div>
	</section>
</main>

<style>
	/* ---- Tokens (matches design.md) ---------------------------------- */
	:root {
		--blue-primary: #1da1f2;
		--blue-secondary: #0d8aef;
		--blue-dark: #0a6bbf;
		--bg-white: #ffffff;
		--bg-light: #f5f8fa;
		--gray-medium: #aab8c2;
		--gray-dark: #657786;
		--text-black: #14171a;
		--border: #e1e8ed;
		--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
		--shadow-md: 0 4px 24px rgba(0, 0, 0, 0.1);
		--radius: 8px;
		--transition: 150ms ease;
	}

	/* ---- Reset -------------------------------------------------------- */
	*,
	*::before,
	*::after {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	/* ---- Root layout -------------------------------------------------- */
	.login-root {
		display: flex;
		min-height: 100dvh;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		color: var(--text-black);
	}

	/* ---- Brand panel -------------------------------------------------- */
	.brand-panel {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--blue-primary) 0%, var(--blue-dark) 100%);
		overflow: hidden;
		padding: 48px;
	}

	.brand-content {
		position: relative;
		z-index: 1;
		text-align: center;
		color: white;
	}

	.pigeon-logo {
		width: 140px;
		height: 140px;
		margin-bottom: 32px;
		filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.2));
		animation: float 4s ease-in-out infinite;
	}

	@keyframes float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-12px);
		}
	}

	.brand-headline {
		font-size: clamp(2rem, 4vw, 3.5rem);
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.02em;
		margin-bottom: 16px;
	}

	.brand-sub {
		font-size: 1.125rem;
		font-weight: 400;
		opacity: 0.85;
	}

	/* Decorative circles */
	.decor {
		position: absolute;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.07);
		pointer-events: none;
	}

	.decor-1 {
		width: 400px;
		height: 400px;
		top: -100px;
		right: -120px;
	}

	.decor-2 {
		width: 260px;
		height: 260px;
		bottom: -60px;
		left: -80px;
	}

	.decor-3 {
		width: 160px;
		height: 160px;
		top: 50%;
		left: 10%;
		transform: translateY(-50%);
	}

	/* ---- Form panel --------------------------------------------------- */
	.form-panel {
		width: min(480px, 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-white);
		padding: 40px 32px;
	}

	.form-card {
		width: 100%;
		max-width: 380px;
	}

	/* Mobile logo – hidden on desktop */
	.mobile-logo {
		display: none;
		margin-bottom: 24px;
	}

	.mobile-logo svg {
		width: 48px;
		height: 48px;
	}

	.form-title {
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin-bottom: 32px;
		color: var(--text-black);
	}

	/* ---- Alerts ------------------------------------------------------- */
	.alert {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 16px;
		border-radius: var(--radius);
		font-size: 0.875rem;
		margin-bottom: 24px;
		animation: slide-in 200ms ease;
	}

	@keyframes slide-in {
		from {
			opacity: 0;
			transform: translateY(-6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.alert-error {
		background: #fff5f5;
		border: 1px solid #feb2b2;
		color: #c53030;
	}

	.alert-icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.alert-content {
		flex: 1;
	}

	.alert-message {
		font-weight: 500;
		margin-bottom: 4px;
	}

	.alert-countdown {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.8125rem;
		color: #9b2c2c;
		font-weight: 600;
	}

	.alert-countdown-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	/* ---- Form fields -------------------------------------------------- */
	.field {
		margin-bottom: 20px;
	}

	.field-label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-black);
		margin-bottom: 8px;
	}

	.field-input {
		width: 100%;
		padding: 12px 16px;
		border: 1.5px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-light);
		font-size: 1rem;
		font-family: inherit;
		color: var(--text-black);
		transition:
			border-color var(--transition),
			box-shadow var(--transition),
			background var(--transition);
		outline: none;
	}

	.field-input::placeholder {
		color: var(--gray-medium);
	}

	.field-input:focus {
		border-color: var(--blue-primary);
		background: var(--bg-white);
		box-shadow: 0 0 0 3px rgba(29, 161, 242, 0.15);
	}

	.field-input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ---- Forgot link -------------------------------------------------- */
	.forgot-link {
		display: inline-block;
		font-size: 0.8125rem;
		color: var(--blue-primary);
		text-decoration: none;
		margin-bottom: 24px;
		transition: color var(--transition);
	}

	.forgot-link:hover {
		color: var(--blue-secondary);
		text-decoration: underline;
	}

	/* ---- Primary button ----------------------------------------------- */
	.btn-primary {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 13px 24px;
		background: var(--blue-primary);
		color: white;
		border: none;
		border-radius: 9999px;
		font-size: 1rem;
		font-weight: 700;
		font-family: inherit;
		cursor: pointer;
		transition:
			background var(--transition),
			transform var(--transition),
			box-shadow var(--transition);
		box-shadow: var(--shadow-sm);
	}

	.btn-primary:hover:not(:disabled) {
		background: var(--blue-secondary);
		box-shadow: 0 4px 12px rgba(13, 138, 239, 0.35);
		transform: translateY(-1px);
	}

	.btn-primary:active:not(:disabled) {
		background: var(--blue-dark);
		transform: translateY(0);
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Spinner */
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ---- Divider ------------------------------------------------------ */
	.divider {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 28px 0;
		color: var(--gray-medium);
		font-size: 0.875rem;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	/* ---- Sign-up prompt ----------------------------------------------- */
	.signup-prompt {
		text-align: center;
		font-size: 0.9375rem;
		color: var(--gray-dark);
	}

	.signup-link {
		color: var(--blue-primary);
		font-weight: 700;
		text-decoration: none;
		transition: color var(--transition);
		margin-left: 4px;
	}

	.signup-link:hover {
		color: var(--blue-secondary);
		text-decoration: underline;
	}

	/* ---- Responsive --------------------------------------------------- */
	@media (max-width: 768px) {
		.login-root {
			flex-direction: column;
		}

		.brand-panel {
			display: none;
		}

		.form-panel {
			width: 100%;
			padding: 48px 24px;
		}

		.mobile-logo {
			display: block;
		}
	}
</style>
