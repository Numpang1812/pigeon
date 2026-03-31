<script lang="ts">
	type NotificationData = {
		id: string | number;
		read: boolean;
		user: string;
		action: string;
		time: string;
	};

	const {
		notification,
		on_click
	}: {
		notification: NotificationData;
		on_click: (id: string | number) => void;
	} = $props();

	function handle_click(): void {
		on_click(notification.id);
	}

	const avatar_initials = $derived(
		notification.user
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? '')
			.join('')
	);
</script>

<button
	class="item {notification.read ? '' : 'unread'}"
	type="button"
	onclick={handle_click}
	aria-label={`Notification from ${notification.user}`}
>
	<div class="avatar" aria-hidden="true">{avatar_initials}</div>

	<div class="content">
		<p class="text">
			<span class="username">{notification.user}</span>
			{notification.action}
		</p>
		<span class="time">{notification.time}</span>
	</div>
</button>

<style>
	.item {
		position: relative;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 13px 14px;
		min-height: 72px;
		border-radius: 14px;
		cursor: pointer;
		transition:
			box-shadow 0.28s cubic-bezier(0.22, 0.61, 0.36, 1),
			background 0.28s cubic-bezier(0.22, 0.61, 0.36, 1),
			border-color 0.28s cubic-bezier(0.22, 0.61, 0.36, 1),
			filter 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
		border: 1px solid #e4edf6;
		width: 100%;
		background: #ffffff;
		text-align: left;
		will-change: box-shadow, background, border-color;
	}

	.item:hover {
		background: #f8fbff;
		box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
	}

	.item:active {
		filter: brightness(0.995);
	}

	.unread {
		background: linear-gradient(90deg, #f1f8ff 0%, #ffffff 50%);
		border-color: #cde4fa;
	}

	.avatar {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: #0f172a;
		background: linear-gradient(145deg, #dbeafe, #e2e8f0);
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
	}

	.content {
		flex: 1;
		min-width: 0;
	}

	.text {
		font-size: 14px;
		line-height: 1.35;
		margin: 0;
		color: #0f172a;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.username {
		font-weight: 700;
		margin-right: 4px;
	}

	.time {
		display: inline-block;
		margin-top: 3px;
		font-size: 12px;
		color: #64748b;
	}
</style>
