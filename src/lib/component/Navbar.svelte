<script lang="ts">
	import { Bell, Search } from 'lucide-svelte';
	import './styles/navbar.css';

	let search = $state('');

	function handle_search(e: Event): void {
		search = (e.currentTarget as HTMLInputElement).value;
	}
</script>

<header class="navbar">
	<div class="right">
		<div class="search-box">
			<span class="icon search-icon"><Search /></span>
			<input
				type="text"
				placeholder="Search Pigeon..."
				bind:value={search}
				oninput={handle_search}
			/>
		</div>

		<button class="icon-btn" type="button" aria-label="Notifications">
			<span class="notify-icon"><Bell /></span>
		</button>

		<div class="avatar">
			<img src="https://i.pravatar.cc/40" alt="user" />
		</div>
	</div>
</header>
