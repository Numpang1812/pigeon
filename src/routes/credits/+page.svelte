<script lang="ts">
	import { Users, Palette, Terminal, BadgeCheck, Sparkles } from 'lucide-svelte';
	import { fade, scale } from 'svelte/transition';

	import type { PageData } from './$types';

	const { data } = $props<{ data: PageData }>();

	const team_roles = [
		{
			username: 'numpang',
			role: 'Founder & CEO',
			fallback_name: 'Numpang',
			fallback_image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAiTKLhmEdvjvwEfL24SV-MZKf5PYoY9NIP3O7Qs-FAWPdkw4FYXFolDgZr84chEFcHiL8zkZnptm_XxYXW_nOR-YAPwfg5slqKhavdqH-pIPXVXXtqALm5-Z4UcOyoC01sDMjizucBxoIiZBEmMn9mTOxqx-3ILa9NFXs0HJhCvhSOrcTq6ublhD4L1ieFeMyiYqsup4YKatQm6e5brTBM-WFc2_PgQbnMSW8VEPK29Uv9DDJPg8Jvobsld9HU22Oog05NxEd3OM4',
			icon: Sparkles,
			contributions: ['Architecture Design', 'Authentication', 'News Feed', 'User Settings', 'Security', 'Data Management', 'Performance', 'Verfied Accounts', 'Quality Control']
		},
		{
			username: 'hongnida',
			role: 'QA & Vice President',
			fallback_name: 'Sam Chen',
			fallback_image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBhviNO3_tqFBcKhR20hHa37bIlVbNPvqyfmRHHOHia47xJJfkjzrwHp1UlzCI0s28KR8x3pd3brxZTrMjMI78WwFYwZoD8yKk-NvAjuovK5p0OEf5IBlAzeEKJQaD8iZnzzLg2KTx85P8-jloWTG4WC4CGM9-n1H46O9xLphDXbtcFkAqME90KZU26oHsQTYfqCi-7pJDdaXix9C6HSH2VPCYDCzhJn0xAWf7pawvsP8qwUrlMtWiObd6fd8y8weNg1Y8DZovJLDU',
			icon: Palette,
			contributions: ['UI/UX Design', 'Testing', 'Social Features', 'Tags Features', 'Status Posting Features', 'Quality Assurance', 'DevOps', 'Bugs Fixing']
		},
		{
			username: 'neath',
			role: 'Developer & Core Member',
			fallback_name: 'Jordan Smith',
			fallback_image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD8H885Ov3ACNKomZLwutH_fpSHYCBNFM9Ph5BBLp6RX1Z02CeYpb05eNvMWXwkX41ORtBqtQ5O4WC9iYj19AZ_Zpgwl6R7UeC001cPrnoRDg_x2AoKQID2Hb0eD2kl59zYxKIV9W9CmjsACxvRZXtwpJLX9G097A5lyqM7O_BfFj-xknf4Dc9EaWYNzKUBwbrKx30chNTAwsvt1g9Pm1fD3stceBtP1_hu5HljgD60dNg_1--SS1rrRmM1e6LHo7iUMAD86H_xyh8',
			icon: Terminal,
			contributions: ['UI/UX Design', 'Notifications System', 'Real-time Features', 'Loading States', 'Responsive Design', 'Followers & Following Features']
		},
		{
			username: 'leak',
			role: 'Developer & Core Member',
			fallback_name: 'Taylor Lee',
			fallback_image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAopx64jhgE0syD0_g1vGgwdFSxeIbcCiM8Wfdr39Jf2UKziFuggJO9Fj9Nh0Sw_l7R5gyLi0B5WXRZNoXhdVMBX1g8ihtIY4FBZVmLJqva6HgDFcU8FI-KERMXWNrJknylH5-LbpPjSpLP0_ArIBB4dg-HFxtnDvNWWQRqlcX67TBBFORnSuodJ8Y9-z-spIDyuQD1jHM-cuENxUw-0_zi8tKjNCwPR5Ec39SJGQIKh8kbFoEzYkoeil3KIBn7nLdGhLzR_LLIKWE',
			icon: BadgeCheck,
			contributions: ['UX/UI Design', 'Explore Page', 'Tags', 'Posting Features', 'Search Engine', 'Bugs Fixes', 'Responsive Design']
		}
	];

	const team = $derived(
		team_roles.map((role) => {
			/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
			const db_user = data.team_users?.find((u: any) => u.username === role.username);
			return {
				name: db_user?.name || role.fallback_name,
				role: role.role,
				image: db_user?.image || role.fallback_image,
				icon: role.icon,
				contributions: role.contributions,
				username: role.username,
				verified: db_user?.verified
			};
		})
	);

	const versions = [
		{ version: 'v1.1.0', status: 'Security & Performance Upgrade', isLatest: true },
		{ version: 'v1.0.0', status: 'First Release', isLatest: false }
	];
</script>

<svelte:head>
	<title>Credits | Pigeon</title>
</svelte:head>

<div class="credits-container">
	<!-- Background Brand Silhouette (using Pigeon Logo) -->
	<div class="brand-silhouette">
		<svg
			viewBox="0 0 120 120"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			style="width: 400px; height: 400px;"
		>
			<circle cx="60" cy="60" r="56" fill="currentColor" />
			<ellipse cx="62" cy="68" rx="34" ry="26" fill="white" />
			<circle cx="90" cy="48" r="18" fill="white" />
			<path d="M106 47 L116 50 L106 53 Z" fill="white" />
		</svg>
	</div>

	<!-- Section Header -->
	<header class="credits-header" in:fade={{ duration: 400 }}>
		<div class="header-icon-wrap">
			<Users size={32} class="text-sky-500" />
		</div>
		<div class="header-text">
			<h1>About Piegon</h1>
			<p>The passionate collective behind Pigeon, building the future of digital conversations.</p>
		</div>
	</header>

	<div class="credits-content">
		<!-- Team Grid -->
		<section class="team-grid">
			{#each team as member, i (member.name)}
				<div 
					class="member-card" 
					in:scale={{ duration: 400, delay: i * 100, start: 0.95 }}
				>
					<div class="card-header">
						<img src={member.image} alt={member.name} class="avatar" />
						<member.icon size={24} class="member-type-icon" />
					</div>
					
					<div class="card-info">
						<div class="name-row">
							<h3>{member.name}</h3>
							{#if member.verified}
								<span class="verified-icon" aria-label="Verified account" title="Verified account">
									<BadgeCheck size={16} aria-hidden="true" fill="#0ea5e9" color="white" />
								</span>
							{/if}
						</div>
						<p class="username">@{member.username}</p>
						<p class="role">{member.role}</p>
					</div>

					<div class="contributions">
						<span class="section-label">Key Contributions</span>
						<div class="tags">
							{#each member.contributions as tag (tag)}
								<span class="tag">{tag}</span>
							{/each}
						</div>
					</div>
				</div>
			{/each}
		</section>

		<!-- Side Info Panel -->
		<aside class="info-panel">
			<div class="info-card" in:fade={{ duration: 400, delay: 400 }}>
				<h4>Version History</h4>
				<div class="version-list">
					{#each versions as v (v.version)}
						<div class="version-item">
							<div class="version-info">
								<p class="v-number">{v.version}</p>
								<p class="v-status">{v.status}</p>
							</div>
							{#if v.isLatest}
								<span class="latest-badge">Latest</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="info-card" in:fade={{ duration: 400, delay: 500 }}>
				<h4>Our Mission</h4>
				<p class="mission-text">To create the world's most interactive and efficient social media platform for modern users.</p>
			</div>
		</aside>
	</div>
</div>

<style>
	.credits-container {
		position: relative;
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		min-height: 100%;
	}

	.brand-silhouette {
		position: absolute;
		top: 4rem;
		right: 0;
		opacity: 0.03;
		pointer-events: none;
		color: #0ea5e9;
	}

	@media (max-width: 1024px) {
		.brand-silhouette {
			display: none;
		}
	}

	.credits-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-bottom: 3rem;
		position: relative;
		z-index: 10;
	}

	.header-icon-wrap {
		background: #f0f9ff;
		padding: 1rem;
		border-radius: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.header-text h1 {
		font-size: 2rem;
		font-weight: 800;
		color: #0f172a;
		margin: 0;
		line-height: 1.2;
	}

	.header-text p {
		color: #64748b;
		margin-top: 0.5rem;
		font-size: 1.1rem;
		max-width: 480px;
	}

	.credits-content {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 2rem;
		position: relative;
		z-index: 10;
	}

	@media (max-width: 900px) {
		.credits-content {
			grid-template-columns: 1fr;
		}
	}

	.team-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.member-card {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 1rem;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.member-card:hover {
		border-color: #bae6fd;
		transform: translateY(-4px);
		box-shadow: 0 12px 30px -10px rgba(15, 23, 42, 0.08);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.avatar {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 999px;
		border: 2px solid #f8fafc;
		object-fit: cover;
	}



	.card-info .name-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.card-info h3 {
		font-size: 1.25rem;
		font-weight: 700;
		color: #0f172a;
		margin: 0;
	}

	.username {
		color: #64748b;
		font-size: 0.85rem;
		margin: 0.15rem 0 0;
	}

	.verified-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.role {
		color: #0ea5e9;
		font-weight: 600;
		font-size: 0.95rem;
		margin-top: 0.25rem;
	}

	.section-label {
		font-size: 0.75rem;
		font-weight: 700;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: block;
		margin-bottom: 0.75rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		background: #f1f5f9;
		color: #475569;
		padding: 0.25rem 0.75rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 500;
		border: 1px solid #e2e8f0;
	}

	.info-panel {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.info-card {
		background: white;
		border: 1px solid #e2e8f0;
		border-radius: 1rem;
		padding: 1.5rem;
	}

	.info-card h4 {
		font-size: 1.1rem;
		font-weight: 700;
		color: #0f172a;
		margin-bottom: 1.25rem;
	}

	.version-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.version-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.v-number {
		font-weight: 600;
		color: #0f172a;
		font-size: 0.95rem;
		margin: 0;
	}

	.v-status {
		font-size: 0.85rem;
		color: #64748b;
		margin: 0;
	}

	.latest-badge {
		background: #f0f9ff;
		color: #0ea5e9;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.25rem 0.5rem;
		border-radius: 0.5rem;
	}

	.mission-text {
		font-size: 0.9rem;
		color: #475569;
		line-height: 1.6;
		margin: 0;
	}
</style>
