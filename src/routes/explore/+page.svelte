<script lang="ts">
	import { resolve } from '$app/paths';
	import { auth_client } from '$lib/auth-client';
	import Sidebar from '$lib/component/Sidebar.svelte';
	import Navbar from '$lib/component/Navbar.svelte';
	import { Flame, Globe2, Music2, Play, Sparkles, Trophy } from 'lucide-svelte';

	const session = auth_client.useSession();

	type CategoryId = (typeof filters)[number]['id'];

	type ExplorePost = {
		id: string;
		title: string;
		location: string;
		creator: string;
		metric: string;
		image: string;
		category: CategoryId;
		topic: string;
	};

	const filters = [
		{ id: 'foryou', label: 'For you', icon: Sparkles },
		{ id: 'trending', label: 'Trending', icon: Flame },
		{ id: 'world', label: 'World', icon: Globe2 },
		{ id: 'music', label: 'Music', icon: Music2 },
		{ id: 'sports', label: 'Sports', icon: Trophy }
	] as const;

	let active_filter = $state<(typeof filters)[number]['id']>('foryou');

	const posts: ExplorePost[] = [
		{
			id: '1',
			title: 'Sunset over Santorini',
			location: 'Greece',
			creator: '@aether.travel',
			metric: '12.4M views',
			image:
				'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'europe'
		},
		{
			id: '2',
			title: 'Shibuya crossing night',
			location: 'Tokyo',
			creator: '@neoncity',
			metric: '28.1M views',
			image:
				'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=400&h=700&fit=crop&q=80',
			category: 'trending',
			topic: 'cities'
		},
		{
			id: '3',
			title: 'Northern lights',
			location: 'Iceland',
			creator: '@polarframe',
			metric: '9.2M views',
			image:
				'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'nature'
		},
		{
			id: '4',
			title: 'Desert dunes',
			location: 'UAE',
			creator: '@heatwave',
			metric: '15.0M views',
			image:
				'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=400&h=700&fit=crop&q=80',
			category: 'sports',
			topic: 'racing'
		},
		{
			id: '5',
			title: 'Carnival in Rio',
			location: 'Brazil',
			creator: '@streetpulse',
			metric: '41M views',
			image:
				'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=400&h=700&fit=crop&q=80',
			category: 'trending',
			topic: 'culture'
		},
		{
			id: '6',
			title: 'Opera House',
			location: 'Sydney',
			creator: '@harborlens',
			metric: '7.8M views',
			image:
				'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=400&h=700&fit=crop&q=80',
			category: 'music',
			topic: 'festival'
		},
		{
			id: 'g1',
			title: 'Paris rooftops',
			location: 'France',
			creator: '@vogue_lens',
			metric: '892K likes',
			image:
				'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'europe'
		},
		{
			id: 'g2',
			title: 'Street food night market',
			location: 'Taipei',
			creator: '@biteglobal',
			metric: '2.1M likes',
			image: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=700&fit=crop&q=80',
			category: 'trending',
			topic: 'food'
		},
		{
			id: 'g3',
			title: 'Safari sunrise',
			location: 'Kenya',
			creator: '@wildframe',
			metric: '3.4M likes',
			image:
				'https://images.unsplash.com/photo-1516426122078-c23e763bd01b?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'africa'
		},
		{
			id: 'g4',
			title: 'Festival main stage',
			location: 'Coachella',
			creator: '@livecrowd',
			metric: '5.6M likes',
			image:
				'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=700&fit=crop&q=80',
			category: 'music',
			topic: 'festival'
		},
		{
			id: 'g5',
			title: 'Venice canal',
			location: 'Italy',
			creator: '@laguna',
			metric: '1.2M likes',
			image:
				'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'europe'
		},
		{
			id: 'g6',
			title: 'Seoul skyline',
			location: 'South Korea',
			creator: '@neoncity',
			metric: '640K likes',
			image:
				'https://images.unsplash.com/photo-1538485399081-7194717c8244?w=400&h=700&fit=crop&q=80',
			category: 'foryou',
			topic: 'cities'
		},
		{
			id: 'g7',
			title: 'Lavender fields',
			location: 'France',
			creator: '@provence',
			metric: '4.3M likes',
			image:
				'https://images.unsplash.com/photo-1499002238440-d264a596e91a?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'nature'
		},
		{
			id: 'g8',
			title: 'NYE fireworks',
			location: 'NYC',
			creator: '@metroflash',
			metric: '18M likes',
			image:
				'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&h=700&fit=crop&q=80',
			category: 'trending',
			topic: 'cities'
		},
		{
			id: 'g9',
			title: 'Temple at dawn',
			location: 'Kyoto',
			creator: '@silentasia',
			metric: '956K likes',
			image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=700&fit=crop&q=80',
			category: 'world',
			topic: 'asia'
		},
		{
			id: 's10',
			title: 'Last-minute goal',
			location: 'London',
			creator: '@touchline',
			metric: '6.2M views',
			image:
				'https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=400&h=700&fit=crop&q=80',
			category: 'sports',
			topic: 'football'
		},
		{
			id: 's11',
			title: 'Buzzer beater',
			location: 'Los Angeles',
			creator: '@rimshot',
			metric: '4.9M views',
			image:
				'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400&h=700&fit=crop&q=80',
			category: 'sports',
			topic: 'basketball'
		},
		{
			id: 's12',
			title: 'Overtake on lap 42',
			location: 'Monaco',
			creator: '@pitlane',
			metric: '8.1M views',
			image:
				'https://images.unsplash.com/photo-1502877338535-766e1452684a?w=400&h=700&fit=crop&q=80',
			category: 'sports',
			topic: 'racing'
		},
		{
			id: 'm13',
			title: 'Studio session',
			location: 'Berlin',
			creator: '@midnightmix',
			metric: '1.7M views',
			image:
				'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=400&h=700&fit=crop&q=80',
			category: 'music',
			topic: 'studio'
		},
		{
			id: 'm14',
			title: 'Dance challenge',
			location: 'Seoul',
			creator: '@choreo.lab',
			metric: '9.8M views',
			image:
				'https://images.unsplash.com/photo-1520975958225-5ccf57e5f5d4?w=400&h=700&fit=crop&q=80',
			category: 'music',
			topic: 'dance'
		}
	];

	type ExploreSection = {
		id: string;
		title: string;
		hint: string;
		items: ExplorePost[];
	};

	function by_category(category: CategoryId): ExplorePost[] {
		return posts.filter((p) => p.category === category);
	}

	function by_topic(category: CategoryId, topic: string): ExplorePost[] {
		return posts.filter((p) => p.category === category && p.topic === topic);
	}

	const sections = $derived(
		((): ExploreSection[] => {
			if (active_filter === 'sports') {
				return [
					{
						id: 'football',
						title: 'Football',
						hint: 'Goals, saves, and crowd noise.',
						items: by_topic('sports', 'football')
					},
					{
						id: 'basketball',
						title: 'Basketball',
						hint: 'Handles, dunks, and buzzer beaters.',
						items: by_topic('sports', 'basketball')
					},
					{
						id: 'racing',
						title: 'Racing',
						hint: 'Overtakes and onboard moments.',
						items: by_topic('sports', 'racing')
					}
				].filter((s) => s.items.length > 0);
			}

			if (active_filter === 'music') {
				return [
					{
						id: 'festival',
						title: 'Festivals',
						hint: 'Big stages, bigger drops.',
						items: by_topic('music', 'festival')
					},
					{
						id: 'dance',
						title: 'Dance',
						hint: 'Choreo loops you can’t unsee.',
						items: by_topic('music', 'dance')
					},
					{
						id: 'studio',
						title: 'Studio',
						hint: 'Behind the sound.',
						items: by_topic('music', 'studio')
					}
				].filter((s) => s.items.length > 0);
			}

			if (active_filter === 'world') {
				return [
					{
						id: 'europe',
						title: 'Europe',
						hint: 'Postcards in motion.',
						items: by_topic('world', 'europe')
					},
					{
						id: 'asia',
						title: 'Asia',
						hint: 'Temples, markets, and rhythm.',
						items: by_topic('world', 'asia')
					},
					{
						id: 'africa',
						title: 'Africa',
						hint: 'Wildlife and wide skies.',
						items: by_topic('world', 'africa')
					},
					{
						id: 'nature',
						title: 'Nature',
						hint: 'Mountains, auroras, and silence.',
						items: by_topic('world', 'nature')
					}
				].filter((s) => s.items.length > 0);
			}

			if (active_filter === 'trending') {
				return [
					{
						id: 'cities',
						title: 'Cities',
						hint: 'Where things go viral first.',
						items: by_topic('trending', 'cities')
					},
					{
						id: 'food',
						title: 'Food',
						hint: 'One bite, instant obsession.',
						items: by_topic('trending', 'food')
					},
					{
						id: 'culture',
						title: 'Culture',
						hint: 'Big moments, bigger energy.',
						items: by_topic('trending', 'culture')
					}
				].filter((s) => s.items.length > 0);
			}

			return [
				{
					id: 'mix',
					title: 'Spotlight',
					hint: 'A little bit of everything - swipe to explore.',
					items: [
						...by_category('trending'),
						...by_category('world'),
						...by_category('music'),
						...by_category('sports'),
						...by_category('foryou')
					]
				}
			].filter((s) => s.items.length > 0);
		})()
	);
</script>

<svelte:head>
	<title>Explore · Pigeon</title>
</svelte:head>

{#if $session.data}
	<div class="app-shell">
		<Sidebar />
		<main class="page-content">
			<Navbar />
			<div class="explore">
				<header class="explore-header">
					<div class="explore-title-block">
						<h1 class="explore-title">Explore</h1>
						<p class="explore-sub">
							Posts from creators and moments around the world - trending, iconic, and unexpected.
						</p>
					</div>
					<div class="filter-row" role="tablist" aria-label="Explore categories">
						{#each filters as f (f.id)}
							<button
								type="button"
								role="tab"
								aria-selected={active_filter === f.id}
								class="filter-chip"
								class:active={active_filter === f.id}
								onclick={() => (active_filter = f.id)}
							>
								<span class="filter-icon"><f.icon size={16} strokeWidth={2.25} /></span>
								{f.label}
							</button>
						{/each}
					</div>
				</header>

				{#each sections as section (section.id)}
					<section class="section spotlight-section" aria-labelledby={`section-${section.id}`}>
						<div class="section-head">
							<h2 id={`section-${section.id}`} class="section-title">{section.title}</h2>
							<span class="section-hint">{section.hint}</span>
						</div>
						<div class="spotlight-rail" role="region" aria-label={`${section.title} posts`}>
							{#each section.items as p (p.id)}
								<article class="spotlight-card">
									<img src={p.image} alt="" class="spotlight-img" loading="lazy" />
									<div class="spotlight-overlay"></div>
									<div class="spotlight-body">
										<span class="spotlight-loc">{p.location}</span>
										<h3 class="spotlight-name">{p.title}</h3>
										<div class="spotlight-meta">
											<span class="play-badge" aria-hidden="true">
												<Play size={14} fill="currentColor" />
											</span>
											<span>{p.creator} · {p.metric}</span>
										</div>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		</main>
	</div>
{:else if !$session.isPending}
	<main class="login-prompt">
		<h2>Unauthenticated</h2>
		<p>You need to log in to view this page.</p>
		<a href={resolve('/')} class="login-link">Go to Login</a>
	</main>
{:else}
	<main class="loading">
		<p>Loading...</p>
	</main>
{/if}

<style>
	.app-shell {
		--sidebar-offset: 260px;
		display: flex;
		gap: 0;
		min-height: 100vh;
	}

	.page-content {
		margin-left: var(--sidebar-offset);
		flex: 1;
		transition: margin-left 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.page-content :global(.navbar) {
		left: var(--sidebar-offset);
		transition: left 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.explore {
		min-height: calc(100vh - 64px);
		margin-top: 64px;
		padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 3rem;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 38%, #ffffff 100%);
		color: #0f172a;
	}

	.explore-header {
		max-width: 1100px;
		margin: 0 auto 1.75rem;
	}

	.explore-title-block {
		margin-bottom: 1.25rem;
	}

	.explore-title {
		margin: 0 0 0.35rem;
		font-size: clamp(1.65rem, 3vw, 2rem);
		font-weight: 800;
		letter-spacing: -0.03em;
	}

	.explore-sub {
		margin: 0;
		max-width: 42rem;
		font-size: 0.95rem;
		line-height: 1.55;
		color: #64748b;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.filter-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		border-radius: 999px;
		border: 1px solid #e2e8f0;
		background: #fff;
		color: #475569;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.18s ease,
			border-color 0.18s ease,
			color 0.18s ease,
			box-shadow 0.18s ease;
	}

	.filter-chip:hover {
		border-color: #cbd5e1;
		background: #f8fafc;
	}

	.filter-chip.active {
		background: linear-gradient(135deg, #0ea5e9 0%, #1da1f2 100%);
		border-color: transparent;
		color: #fff;
		box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
	}

	.filter-icon {
		display: inline-flex;
		opacity: 0.9;
	}

	.section {
		max-width: 1100px;
		margin: 0 auto 2.5rem;
	}

	.section-head {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin-bottom: 1rem;
	}

	.section-title {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.section-hint {
		font-size: 0.8rem;
		color: #94a3b8;
	}

	.spotlight-rail {
		display: flex;
		gap: 0.85rem;
		overflow-x: auto;
		padding-bottom: 0.5rem;
		scroll-snap-type: x mandatory;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scrollbar-color: #cbd5e1 transparent;
	}

	.spotlight-card {
		position: relative;
		flex: 0 0 auto;
		width: min(42vw, 200px);
		aspect-ratio: 9 / 16;
		max-height: 420px;
		border-radius: 1.1rem;
		overflow: hidden;
		scroll-snap-align: start;
		box-shadow:
			0 12px 32px rgba(15, 23, 42, 0.12),
			0 0 0 1px rgba(148, 163, 184, 0.15);
	}

	.spotlight-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.spotlight-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			180deg,
			transparent 35%,
			rgba(15, 23, 42, 0.08) 55%,
			rgba(15, 23, 42, 0.82) 100%
		);
		pointer-events: none;
	}

	.spotlight-body {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 0.75rem 0.85rem 0.95rem;
		color: #fff;
		text-align: left;
	}

	.spotlight-loc {
		display: block;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		opacity: 0.85;
		margin-bottom: 0.15rem;
	}

	.spotlight-name {
		margin: 0 0 0.4rem;
		font-size: 0.88rem;
		font-weight: 700;
		line-height: 1.25;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.spotlight-meta {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.72rem;
		opacity: 0.92;
	}

	.play-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.22);
		backdrop-filter: blur(6px);
	}

	/* Grid removed; everything uses spotlight-style cards now */

	.login-prompt {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
		gap: 1rem;
	}

	.login-link {
		color: #1da1f2;
		font-weight: 700;
		text-decoration: none;
	}

	.login-link:hover {
		text-decoration: underline;
	}

	.loading {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	@media (max-width: 900px) {
		.app-shell {
			--sidebar-offset: 0px;
		}

		.page-content {
			margin-left: 0;
		}
	}

	@media (max-width: 520px) {
		.spotlight-card {
			width: min(58vw, 180px);
		}

		/* Previously: masonry grid tweaks */
	}
</style>
