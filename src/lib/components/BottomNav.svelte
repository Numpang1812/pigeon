<script lang="ts">
	import { Home, Search, PlusCircle, Bell, Info } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import './styles/bottom-nav.css';

	const current_path = $derived(page.url.pathname);

	interface NavItem {
		label: string;
		icon: typeof Home;
		href: string;
		center?: boolean;
	}

	const items: NavItem[] = [
		{ label: 'Home', icon: Home, href: '/home' },
		{ label: 'Search', icon: Search, href: '/explore' },
		{ label: 'Post', icon: PlusCircle, href: '/compose', center: true },
		{ label: 'Notifications', icon: Bell, href: '/notifications' },
		{ label: 'About', icon: Info, href: '/credits' }
	];

	function is_active(href: string): boolean {
		if (href === '/home' && current_path === '/') return true;
		return current_path === href;
	}
</script>

<nav class="bottom-nav">
	{#each items as item (item.label)}
		<a 
			/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
			href={resolve(item.href as any)} 
			class="bottom-nav-item" 
			class:active={is_active(item.href)}
			class:center-item={!!item.center}
			aria-label={item.label}
		>
			<span class="icon">
				<item.icon size={item.center ? 32 : 24} />
			</span>
			{#if !item.center}
				<span class="bottom-nav-label">{item.label}</span>
			{/if}
		</a>
	{/each}
</nav>
