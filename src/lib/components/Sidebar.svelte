<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft, Home, Search, Bell, User, Edit, LogOut, Menu } from 'lucide-svelte';
	import { fly } from 'svelte/transition';
	import './styles/sidebar.css';
	import { auth_client } from '$lib/auth-client';

	type AppRoute = '/' | '/home' | '/explore' | '/profile' | '/notifications' | '/compose';

	const current_path = $derived(page.url.pathname);

	function is_main_path(path: string): boolean {
		return (
			path === '/home' ||
			path === '/explore' ||
			path === '/notifications' ||
			path === '/profile' ||
			path === '/profile/edit'
		);
	}

	let last_main_path = $state(is_main_path(page.url.pathname) ? page.url.pathname : '/home');

	$effect(() => {
		if (is_main_path(current_path)) {
			last_main_path = current_path;
		}
	});

	function is_active(href: string): boolean {
		const effective_path = is_main_path(current_path) ? current_path : last_main_path;
		if (href === '/profile') {
			return effective_path === '/profile' || effective_path === '/profile/edit';
		}
		return effective_path === href;
	}

	let is_collapsed = $state(false);
	let mobile_open = $state(false);
	let show_logout_confirm = $state(false);
	let is_logging_out = $state(false);

	const nav_items = [
		{ label: 'Home', icon: Home, href: '/home' },
		{ label: 'Explore', icon: Search, href: '/explore' },
		{ label: 'Notifications', icon: Bell, href: '/notifications' },
		{ label: 'Profile', icon: User, href: '/profile' }
	] as const satisfies ReadonlyArray<{
		label: string;
		icon: typeof Home;
		href: AppRoute;
	}>;

	function request_logout(): void {
		show_logout_confirm = true;
	}

	function cancel_logout(): void {
		show_logout_confirm = false;
	}

	async function confirm_logout(): Promise<void> {
		if (is_logging_out) {
			return;
		}

		is_logging_out = true;

		try {
			await auth_client.signOut();
			window.location.href = resolve('/');
		} finally {
			is_logging_out = false;
		}
	}

	function toggle_sidebar(): void {
		is_collapsed = !is_collapsed;
	}

	function open_mobile(): void {
		mobile_open = true;
	}

	function close_mobile(): void {
		mobile_open = false;
	}

	function sync_sidebar_offset_css_var(): void {
		if (typeof window === 'undefined') return;
		const root = document.documentElement;

		if (window.innerWidth <= 900) {
			root.style.setProperty('--sidebar-offset', '0px');
			return;
		}

		root.style.setProperty('--sidebar-offset', is_collapsed ? '84px' : '260px');
	}

	$effect(() => {
		if (typeof window === 'undefined') return;

		sync_sidebar_offset_css_var();

		window.dispatchEvent(
			new CustomEvent('sidebar-state-changed', {
				detail: { is_collapsed }
			})
		);
	});

	$effect(() => {
		if (typeof window === 'undefined') return;

		const handle_resize = (): void => {
			sync_sidebar_offset_css_var();
		};

		window.addEventListener('resize', handle_resize);

		return () => {
			window.removeEventListener('resize', handle_resize);
		};
	});

	$effect(() => {
		const toggle_from_navbar = (): void => {
			if (window.innerWidth <= 900) {
				open_mobile();
				return;
			}

			toggle_sidebar();
		};

		window.addEventListener('sidebar-toggle-requested', toggle_from_navbar);

		return () => {
			window.removeEventListener('sidebar-toggle-requested', toggle_from_navbar);
		};
	});
</script>

{#if mobile_open}
	<div
		class="overlay"
		role="button"
		tabindex="0"
		onclick={close_mobile}
		onkeydown={(e) => e.key === 'Escape' && close_mobile()}
	></div>
{/if}

<aside class="sidebar {is_collapsed ? 'collapsed' : ''} {mobile_open ? 'open' : ''}">
	<div class="top">
		{#if is_collapsed}
			<button
				class="collapsed-menu-toggle"
				type="button"
				aria-label="Expand sidebar"
				onclick={toggle_sidebar}
			>
				<Menu size={20} />
			</button>
		{:else}
			<h1 class="logo">
				<svg
					class="logo-icon"
					viewBox="0 0 120 120"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					aria-label="Pigeon logo"
				>
					<defs>
						<radialGradient id="pigeon-bg" cx="50%" cy="38%" r="70%">
							<stop offset="0%" stop-color="#7dd3fc" />
							<stop offset="100%" stop-color="#0ea5e9" />
						</radialGradient>
					</defs>
					<circle cx="60" cy="60" r="56" fill="url(#pigeon-bg)" />
					<circle cx="60" cy="60" r="55" stroke="rgba(255, 255, 255, 0.45)" stroke-width="1.5" />
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
				<span class="brand-text">Pigeon</span>
			</h1>
		{/if}

		{#if mobile_open}
			<button
				class="mobile-back-toggle"
				type="button"
				aria-label="Close sidebar"
				onclick={close_mobile}
			>
				<ArrowLeft size={20} />
			</button>
		{/if}
	</div>

	<nav class="nav">
		{#each nav_items as item, index (item.label)}
			<a
				class="nav-item nav-item-{index}"
				class:active={is_active(item.href)}
				href={resolve(item.href)}
				aria-label={item.label}
				aria-current={is_active(item.href) ? 'page' : undefined}
			>
				<span class="icon"><item.icon size={20} /></span>

				<span class="label">{item.label}</span>
				<span class="hover-label" aria-hidden="true">{item.label}</span>
			</a>
		{/each}
	</nav>

	<div class="bottom">
		<a class="compose" href={resolve('/compose')} aria-label="Compose">
			<Edit size={20} />
			<span class="action-label">Compose</span>
			<span class="action-hover-label" aria-hidden="true">Compose</span>
		</a>

		{#if show_logout_confirm}
			<div class="logout-confirm" transition:fly={{ y: 10, duration: 180 }}>
				<p>Log out of your account?</p>
				<div class="logout-confirm-actions">
					<button class="logout-cancel" type="button" onclick={cancel_logout}>Cancel</button>
					<button
						class="logout-confirm-btn"
						type="button"
						onclick={confirm_logout}
						disabled={is_logging_out}
					>
						{is_logging_out ? 'Logging out...' : 'Yes, log out'}
					</button>
				</div>
			</div>
		{:else}
			<button class="logout" type="button" aria-label="Logout" onclick={request_logout}>
				<LogOut size={20} />
				<span class="action-label">Logout</span>
				<span class="action-hover-label" aria-hidden="true">Logout</span>
			</button>
		{/if}
	</div>
</aside>
