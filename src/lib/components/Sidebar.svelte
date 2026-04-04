<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Home, Search, Bell, User, Edit, LogOut } from 'lucide-svelte';
	import './styles/sidebar.css';
	import { auth_client } from '$lib/auth-client';

	type AppRoute = string;

	let is_collapsed = $state(false);
	let mobile_open = $state(false);

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

	async function handle_logout() {
		await auth_client.signOut();
		goto(resolve('/'));
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
</script>

<button class="mobile-btn" onclick={open_mobile}> ☰ </button>

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
		<h1 class="logo">
			<svg
				class="logo-icon"
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
			{#if !is_collapsed}
				<span class="brand-text">Pigeon</span>
			{/if}
		</h1>

		<button
			class="toggle-btn {is_collapsed ? 'collapsed' : ''}"
			onclick={toggle_sidebar}
			type="button"
			aria-label={is_collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			<span class="toggle-arrow" aria-hidden="true"></span>
		</button>
	</div>

	<nav class="nav">
		{#each nav_items as item, index (item.label)}
			<a class="nav-item nav-item-{index}" href={resolve(item.href)} aria-label={item.label}>
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

		<button class="logout" type="button" aria-label="Logout" onclick={handle_logout}>
			<LogOut size={20} />
			<span class="action-label">Logout</span>
			<span class="action-hover-label" aria-hidden="true">Logout</span>
		</button>
	</div>
</aside>
