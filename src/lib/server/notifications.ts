import { db } from '$lib/server/db';

export type ActivityNotificationType = 'like' | 'dislike' | 'repost' | 'follow';

export type ActivityNotificationItem = {
	id: string;
	type: ActivityNotificationType;
	actor_name: string;
	actor_handle: string;
	avatar_url: string;
	is_following_actor: boolean;
	message: string;
	created_at: string;
	time_ago: string;
	day_group: 'Today' | 'Earlier this week' | 'Older';
	unread: boolean;
	post_id: string | null;
};

type FetchNotificationsOptions = {
	limit?: number;
	offset?: number;
};

type DbNotificationRow = {
	event_id: string;
	type: ActivityNotificationType;
	created_at: string;
	actor_id: string;
	actor_name: string | null;
	actor_handle: string | null;
	avatar_url: string | null;
	is_following_actor: number | boolean | null;
	post_id: string | null;
	post_content: string | null;
};

export async function fetch_activity_notifications_for_user(
	user_id: string,
	options: FetchNotificationsOptions = {}
): Promise<ActivityNotificationItem[]> {
	const limit = Number.isFinite(options.limit)
		? Math.min(Math.max(options.limit ?? 30, 1), 100)
		: 30;
	const offset = Number.isFinite(options.offset) ? Math.max(options.offset ?? 0, 0) : 0;

	const result = await db.execute({
		sql: `
			SELECT *
			FROM (
				SELECT
					l.id AS event_id,
					'like' AS type,
					l.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					p.id AS post_id,
					p.content AS post_content
				FROM like l
				JOIN post p ON p.id = l.post_id
				JOIN user u ON u.id = l.user_id
				WHERE p.author_id = ? AND l.user_id != ?

				UNION ALL

				SELECT
					d.id AS event_id,
					'dislike' AS type,
					d.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					p.id AS post_id,
					p.content AS post_content
				FROM dislike d
				JOIN post p ON p.id = d.post_id
				JOIN user u ON u.id = d.user_id
				WHERE p.author_id = ? AND d.user_id != ?

				UNION ALL

				SELECT
					r.id AS event_id,
					'repost' AS type,
					r.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					p.id AS post_id,
					p.content AS post_content
				FROM repost r
				JOIN post p ON p.id = r.post_id
				JOIN user u ON u.id = r.user_id
				WHERE p.author_id = ? AND r.user_id != ?

				UNION ALL

				SELECT
					f.id AS event_id,
					'follow' AS type,
					f.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					NULL AS post_id,
					NULL AS post_content
				FROM follow f
				JOIN user u ON u.id = f.follower_id
				WHERE f.following_id = ? AND f.follower_id != ?
			)
			ORDER BY created_at DESC
			LIMIT ? OFFSET ?
		`,
		args: [
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			user_id,
			limit,
			offset
		]
	});

	return result.rows.map((row) => {
		const item = row as unknown as DbNotificationRow;
		const actor_name = item.actor_name ?? 'Unknown';
		const actor_handle = item.actor_handle ?? 'user';
		const post_preview = item.post_content ? clip_text(item.post_content, 72) : '';

		let message: string;
		switch (item.type) {
			case 'like':
				message = `liked your post${post_preview ? ` "${post_preview}"` : '.'}`;
				break;
			case 'dislike':
				message = `disliked your post${post_preview ? ` "${post_preview}"` : '.'}`;
				break;
			case 'repost':
				message = `reposted your post${post_preview ? ` "${post_preview}"` : '.'}`;
				break;
			case 'follow':
				message = 'started following you.';
				break;
			default:
				message = 'interacted with your account.';
		}

		return {
			id: `${item.type}-${item.event_id}`,
			type: item.type,
			actor_name,
			actor_handle,
			avatar_url: item.avatar_url ?? '',
			is_following_actor: Boolean(item.is_following_actor),
			message,
			created_at: item.created_at,
			time_ago: format_time_ago(item.created_at),
			day_group: get_day_group(item.created_at),
			unread: false,
			post_id: item.post_id
		};
	});
}

function clip_text(text: string, max_length: number): string {
	if (text.length <= max_length) return text;
	return `${text.slice(0, max_length - 3)}...`;
}

function get_day_group(date_string: string): 'Today' | 'Earlier this week' | 'Older' {
	const date = new Date(date_string + 'Z');
	const now = new Date();
	const diff_seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diff_seconds < 86400) return 'Today';
	if (diff_seconds < 604800) return 'Earlier this week';
	return 'Older';
}

function format_time_ago(date_string: string): string {
	const date = new Date(date_string + 'Z');
	const now = new Date();
	const diff_seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diff_seconds < 60) return `${diff_seconds}s`;
	if (diff_seconds < 3600) return `${Math.floor(diff_seconds / 60)}m`;
	if (diff_seconds < 86400) return `${Math.floor(diff_seconds / 3600)}h`;
	if (diff_seconds < 604800) return `${Math.floor(diff_seconds / 86400)}d`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
