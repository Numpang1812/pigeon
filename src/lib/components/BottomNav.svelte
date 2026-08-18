<script lang="ts">
	import { Home, Search, PlusCircle, Bell, Bird } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import './styles/bottom-nav.css';
	import { unread_conversations } from '$lib/pigeon/arrivals';

	const current_path = $derived(page.url.pathname);

	// Typed as actual route ids rather than string, so resolve() accepts them
	// without a cast. The previous `as any` was suppressed by an eslint comment
	// written in markup, where Svelte treats it as text rather than a directive —
	// so it never suppressed anything and rendered into the DOM.
	type AppRoute = '/home' | '/explore' | '/compose' | '/notifications' | '/messages';

	interface NavItem {
		label: string;
		icon: typeof Home;
		href: AppRoute;
		center?: boolean;
	}

	const items: NavItem[] = [
		{ label: 'Home', icon: Home, href: '/home' },
		{ label: 'Search', icon: Search, href: '/explore' },
		{ label: 'Post', icon: PlusCircle, href: '/compose', center: true },
		{ label: 'Notifications', icon: Bell, href: '/notifications' },
		// Replaces About, which stays reachable from the sidebar. Five slots only,
		// and Pigeons earns one more than a credits link does.
		{ label: 'Pigeons', icon: Bird, href: '/messages' }
	];

	function is_active(href: string): boolean {
		if (href === '/home' && current_path === '/') return true;
		if (href === '/messages') return current_path.startsWith('/messages');
		return current_path === href;
	}
</script>

<nav class="bottom-nav">
	{#each items as item (item.label)}
		<a
			href={resolve(item.href)}
			class="bottom-nav-item"
			class:active={is_active(item.href)}
			class:center-item={!!item.center}
			aria-label={item.label}
		>
			<span class="icon">
				<item.icon size={item.center ? 32 : 24} />
				{#if item.href === '/messages' && $unread_conversations > 0}
					<span class="bottom-nav-badge">{$unread_conversations}</span>
				{/if}
			</span>
			{#if !item.center}
				<span class="bottom-nav-label">{item.label}</span>
			{/if}
		</a>
	{/each}
</nav>
