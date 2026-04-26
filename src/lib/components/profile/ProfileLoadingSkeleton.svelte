<div class="profile-layout">
	<div class="main-feed">
		<div class="profile-header">
			<div class="cover-skeleton shimmer"></div>

			<div class="profile-actions-row">
				<div class="avatar-skeleton shimmer"></div>
				<div class="btn-skeleton shimmer"></div>
			</div>

			<div class="user-info">
				<div class="name-skeleton shimmer"></div>
				<div class="handle-skeleton shimmer"></div>
				<div class="bio-skeleton shimmer"></div>
				<div class="bio-skeleton bio-skeleton--short shimmer"></div>
				<div class="meta-skeleton shimmer"></div>
				<div class="stats-row">
					<div class="stat-skeleton shimmer"></div>
					<div class="stat-skeleton shimmer"></div>
					<div class="stat-skeleton shimmer"></div>
				</div>
			</div>
		</div>

		<div class="tabs-skeleton">
			{#each [1, 2, 3, 4] as tab (tab)}
				<div class="tab-skeleton shimmer"></div>
			{/each}
		</div>

		<div class="posts-skeleton">
			{#each [1, 2, 3] as post (post)}
				<div class="post-skeleton">
					<div class="post-avatar shimmer"></div>
					<div class="post-body">
						<div class="post-name shimmer"></div>
						<div class="post-line shimmer"></div>
						<div class="post-line post-line--short shimmer"></div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	@keyframes shimmer {
		0% { background-position: -600px 0; }
		100% { background-position: 600px 0; }
	}

	.shimmer {
		background: linear-gradient(90deg, #f0f4f8 25%, #e2eaf2 50%, #f0f4f8 75%);
		background-size: 1200px 100%;
		animation: shimmer 1.4s infinite linear;
		border-radius: 6px;
	}

	.profile-layout {
		min-height: 100%;
		width: 100%;
		display: flex;
		justify-content: center;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	.main-feed {
		width: 100%;
		max-width: 980px;
		min-height: 100%;
	}

	.profile-header {
		display: flex;
		flex-direction: column;
		border-bottom: 1px solid #e1e8ed;
		padding: 0 0 0;
		background-color: white;
	}

	.cover-skeleton {
		height: 200px;
		border-radius: 0;
	}

	.profile-actions-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		padding: 0 16px;
		margin-top: -66px;
		margin-bottom: 12px;
	}

	.avatar-skeleton {
		width: 132px;
		height: 132px;
		border-radius: 50%;
		border: 4px solid #fff;
		background-clip: padding-box;
		flex-shrink: 0;
	}

	.btn-skeleton {
		width: 110px;
		height: 36px;
		border-radius: 9999px;
		margin-top: 78px;
	}

	.user-info {
		padding: 8px 16px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.name-skeleton {
		width: 160px;
		height: 22px;
	}

	.handle-skeleton {
		width: 100px;
		height: 16px;
	}

	.bio-skeleton {
		width: 90%;
		height: 16px;
	}

	.bio-skeleton--short {
		width: 60%;
	}

	.meta-skeleton {
		width: 140px;
		height: 16px;
		margin-top: 4px;
	}

	.stats-row {
		display: flex;
		gap: 20px;
		margin-top: 4px;
	}

	.stat-skeleton {
		width: 64px;
		height: 36px;
		border-radius: 6px;
	}

	.tabs-skeleton {
		display: flex;
		border-bottom: 1px solid #e1e8ed;
		background: white;
		padding: 0 4px;
	}

	.tab-skeleton {
		flex: 1;
		height: 52px;
		margin: 4px;
		border-radius: 6px;
	}

	.posts-skeleton {
		background: white;
	}

	.post-skeleton {
		display: flex;
		gap: 12px;
		padding: 16px;
		border-bottom: 1px solid #e1e8ed;
	}

	.post-avatar {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.post-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-top: 4px;
	}

	.post-name {
		width: 140px;
		height: 16px;
	}

	.post-line {
		width: 100%;
		height: 14px;
	}

	.post-line--short {
		width: 65%;
	}
</style>
