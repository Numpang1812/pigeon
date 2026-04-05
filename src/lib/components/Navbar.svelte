<script lang="ts">
	import { Bell, Search } from 'lucide-svelte';
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import './styles/navbar.css';

	const session = auth_client.useSession();

	let search = $state('');
	let results = $state<{ id: string; name: string; username: string; image: string | null }[]>([]);
	let is_loading = $state(false);
	let show_dropdown = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function fetch_users(query: string) {
		if (!query.trim()) {
			results = [];
			show_dropdown = false;
			return;
		}

		is_loading = true;
		show_dropdown = true;
		try {
			const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
			if (res.ok) {
				const data = await res.json();
				results = data.users || [];
			}
		} catch (e) {
			console.error(e);
		} finally {
			is_loading = false;
		}
	}

	function handle_search(e: Event): void {
		search = (e.currentTarget as HTMLInputElement).value;
		clearTimeout(timer);
		timer = setTimeout(() => {
			fetch_users(search);
		}, 300);
	}

	function close_dropdown() {
		setTimeout(() => { show_dropdown = false; }, 200);
	}
</script>

<header class="navbar">
	<div class="right">
		<div class="search-container">
			<div class="search-box">
				<span class="icon search-icon"><Search /></span>
				<input
					type="text"
					placeholder="Search Pigeon..."
					bind:value={search}
					oninput={handle_search}
					onblur={close_dropdown}
					onfocus={() => { if(search) show_dropdown = true; }}
				/>
			</div>
			
			{#if show_dropdown}
				<div class="search-dropdown">
					{#if is_loading}
						<div class="search-item loading">Searching...</div>
					{:else if results.length > 0}
						{#each results as user (user.id)}
							<!-- svelte-ignore a11y_invalid_attribute -->
							<!-- @ts-expect-error bypass generated routes types -->
							<a href={resolve(`/profile/${user.id}`)} class="search-item">
								<img src={user.image || 'https://i.pravatar.cc/40'} alt={user.name} class="search-avatar" />
								<div class="search-info">
									<p class="search-name">{user.name}</p>
									<p class="search-email">@{user.username}</p>
								</div>
							</a>
						{/each}
					{:else if search.trim().length > 0}
						<div class="search-item no-results">No users found for "{search}"</div>
					{/if}
				</div>
			{/if}
		</div>

		<button class="icon-btn" type="button" aria-label="Notifications">
			<span class="notify-icon"><Bell /></span>
		</button>

		<a class="avatar" href={resolve('/profile')} aria-label="View profile">
			<img src={$session.data?.user?.image || 'https://i.pravatar.cc/40'} alt="user" />
		</a>
	</div>
</header>
