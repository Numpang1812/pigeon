import { db } from '$lib/server/db';
import { epoch_from_sql, format_eta } from '$lib/pigeon/clock';
import type { NotificationPrefs } from '$lib/server/profile-helpers';

export type ActivityNotificationType = 'like' | 'dislike' | 'repost' | 'follow' | 'pigeon';

export type ActivityNotificationItem = {
	id: string;
	type: ActivityNotificationType;
	actor_name: string;
	actor_handle: string;
	avatar_url: string;
	actor_verified: boolean;
	is_following_actor: boolean;
	message: string;
	created_at: string;
	time_ago: string;
	day_group: 'Today' | 'Earlier this week' | 'Older';
	unread: boolean;
	post_id: string | null;
	conversation_id: string | null;
};

type FetchNotificationsOptions = {
	limit?: number;
	offset?: number;
	/** Types the viewer switched off in Settings; missing keys count as on. */
	prefs?: NotificationPrefs;
};

type DbNotificationRow = {
	event_id: string;
	type: ActivityNotificationType;
	created_at: string;
	actor_id: string;
	actor_name: string | null;
	actor_handle: string | null;
	avatar_url: string | null;
	actor_verified: number | boolean | null;
	is_following_actor: number | boolean | null;
	post_id: string | null;
	post_content: string | null;
	conversation_id: string | null;
	deliver_at: string | null;
};

export async function fetch_activity_notifications_for_user(
	user_id: string,
	options: FetchNotificationsOptions = {}
): Promise<ActivityNotificationItem[]> {
	const limit = Number.isFinite(options.limit) ? Math.min(Math.max(options.limit ?? 30, 1), 100) : 30;
	const offset = Number.isFinite(options.offset) ? Math.max(options.offset ?? 0, 0) : 0;

	const prefs = options.prefs;
	const gate = (key: keyof NotificationPrefs): number => (prefs && !prefs[key] ? 1 : 0);
	const gate_args = [gate('like'), gate('dislike'), gate('repost'), gate('follow'), gate('pigeon')];
	const now_ms = Date.now();

	const result = await db.execute({
		sql: `
			SELECT *
			FROM (
				SELECT
					COALESCE(l.id, l.user_id || '-' || l.post_id || '-' || l.created_at) AS event_id,
					'like' AS type,
					l.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					u.verified AS actor_verified,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					p.id AS post_id,
					p.content AS post_content,
					NULL AS conversation_id,
					NULL AS deliver_at
				FROM like l
				JOIN post p ON p.id = l.post_id
				JOIN user u ON u.id = l.user_id
				WHERE p.author_id = ? AND l.user_id != ?
				  AND (? = 0)

				UNION ALL

				SELECT
					COALESCE(d.id, d.user_id || '-' || d.post_id || '-' || d.created_at) AS event_id,
					'dislike' AS type,
					d.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					u.verified AS actor_verified,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					p.id AS post_id,
					p.content AS post_content,
					NULL AS conversation_id,
					NULL AS deliver_at
				FROM dislike d
				JOIN post p ON p.id = d.post_id
				JOIN user u ON u.id = d.user_id
				WHERE p.author_id = ? AND d.user_id != ?
				  AND (? = 0)

				UNION ALL

				SELECT
					COALESCE(r.id, r.user_id || '-' || r.post_id || '-' || r.created_at) AS event_id,
					'repost' AS type,
					r.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					u.verified AS actor_verified,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					p.id AS post_id,
					p.content AS post_content,
					NULL AS conversation_id,
					NULL AS deliver_at
				FROM repost r
				JOIN post p ON p.id = r.post_id
				JOIN user u ON u.id = r.user_id
				WHERE p.author_id = ? AND r.user_id != ?
				  AND (? = 0)

				UNION ALL

				SELECT
					COALESCE(f.id, f.follower_id || '-' || f.following_id || '-' || f.created_at) AS event_id,
					'follow' AS type,
					f.created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					u.verified AS actor_verified,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					NULL AS post_id,
					NULL AS post_content,
					NULL AS conversation_id,
					NULL AS deliver_at
				FROM follow f
				JOIN user u ON u.id = f.follower_id
				WHERE f.following_id = ? AND f.follower_id != ?
				  AND (? = 0)

				UNION ALL

				SELECT
					m.id || '-' || md.recipient_id AS event_id,
					'pigeon' AS type,
					m.departed_at AS created_at,
					u.id AS actor_id,
					u.name AS actor_name,
					u.username AS actor_handle,
					u.image AS avatar_url,
					u.verified AS actor_verified,
					EXISTS(
						SELECT 1
						FROM follow f2
						WHERE f2.follower_id = ? AND f2.following_id = u.id
					) AS is_following_actor,
					NULL AS post_id,
					NULL AS post_content,
					m.conversation_id AS conversation_id,
					md.deliver_at AS deliver_at
				FROM message_delivery md
				JOIN message m ON m.id = md.message_id
				JOIN user u ON u.id = m.sender_id
				WHERE md.recipient_id = ?
				  AND md.cancelled_at IS NULL
				  AND md.deliver_at > ?
				  AND m.deleted_at IS NULL
				  AND (? = 0)
			)
			ORDER BY created_at DESC
			LIMIT ? OFFSET ?
		`,
		args: [
			// like arm
			user_id, user_id, user_id, gate_args[0],
			// dislike arm
			user_id, user_id, user_id, gate_args[1],
			// repost arm
			user_id, user_id, user_id, gate_args[2],
			// follow arm
			user_id, user_id, user_id, gate_args[3],
			// pigeon arm
			user_id, user_id, now_ms, gate_args[4],
			limit, offset
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
				message = item.is_following_actor
					? 'followed you back. You are now friends — you can send each other Pigeons.'
					: 'started following you.';
				break;
			case 'pigeon': {
				const deliver_at_ms = epoch_from_sql(item.deliver_at);
				const eta = format_eta(deliver_at_ms, now_ms);
				message = eta && eta !== 'arrived' ? `sent you a pigeon. It will ${eta}.` : 'sent you a pigeon.';
				break;
			}
			default:
				message = 'interacted with your account.';
		}

		return {
			id: `${item.type}-${item.event_id}`,
			type: item.type,
			actor_name,
			actor_handle,
			avatar_url: item.avatar_url || '/default-avatar.svg',
			actor_verified: Boolean(item.actor_verified),
			is_following_actor: Boolean(item.is_following_actor),
			message,
			created_at: item.created_at,
			time_ago: format_time_ago(item.created_at),
			day_group: get_day_group(item.created_at),
			unread: false,
			post_id: item.post_id,
			conversation_id: item.conversation_id
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
