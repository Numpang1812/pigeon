import { db } from './db';
import { normalize_handle } from '$lib';

export async function get_profile_user_by_id(user_id: string) {
	const user_result = await db.execute({
		sql: 'SELECT id, name, username, bio, image, createdAt FROM user WHERE id = ?',
		args: [user_id]
	});

	return user_result.rows.length > 0 ? user_result.rows[0] : null;
}

export async function get_profile_user_by_handle(handle: string) {
	const normalized_handle = normalize_handle(handle);

	if (!normalized_handle) {
		return null;
	}

	const user_result = await db.execute({
		sql: 'SELECT id, name, username, bio, image, createdAt FROM user WHERE lower(username) = lower(?) LIMIT 1',
		args: [normalized_handle]
	});

	return user_result.rows.length > 0 ? user_result.rows[0] : null;
}

export async function get_follow_counts(profile_user_id: string) {
	const [followers_result, following_result] = await Promise.all([
		db.execute({
			sql: 'SELECT COUNT(*) as count FROM follow WHERE following_id = ?',
			args: [profile_user_id]
		}),
		db.execute({
			sql: 'SELECT COUNT(*) as count FROM follow WHERE follower_id = ?',
			args: [profile_user_id]
		})
	]);

	return {
		followers: Number(followers_result.rows[0]?.count ?? 0),
		following: Number(following_result.rows[0]?.count ?? 0)
	};
}

export async function get_access_state(viewer_user_id: string, profile_user_id: string, is_owner: boolean) {
	if (is_owner) {
		return {
			is_owner: true,
			is_following: false
		};
	}

	const relationship_result = await db.execute({
		sql: 'SELECT id FROM follow WHERE follower_id = ? AND following_id = ? LIMIT 1',
		args: [viewer_user_id, profile_user_id]
	});

	return {
		is_owner: false,
		is_following: relationship_result.rows.length > 0
	};
}

function get_posts_where_clause(is_owner: boolean) {
	if (is_owner) {
		return 'WHERE p.author_id = ?';
	}

	return "WHERE p.author_id = ? AND p.audience = 'public'";
}

export async function get_profile_posts(viewer_user_id: string, profile_user_id: string, is_owner: boolean) {
	const where_clause = get_posts_where_clause(is_owner);

	return db.execute({
		sql: `SELECT p.id, p.content, p.post_tag, p.audience, p.created_at,
			(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
			(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
			(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count,
			(SELECT COUNT(*) > 0 FROM like WHERE post_id = p.id AND user_id = ?) as user_liked,
			(SELECT COUNT(*) > 0 FROM dislike WHERE post_id = p.id AND user_id = ?) as user_disliked,
			(SELECT COUNT(*) > 0 FROM repost WHERE post_id = p.id AND user_id = ?) as user_reposted
			FROM post p
			${where_clause}
			ORDER BY p.created_at DESC
			LIMIT 50`,
		args: [viewer_user_id, viewer_user_id, viewer_user_id, profile_user_id]
	});
}

export function format_time_ago(date_string: string): string {
	const date = new Date(date_string + 'Z');
	const now = new Date();
	const diff_seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diff_seconds < 60) return `${diff_seconds}s`;
	if (diff_seconds < 3600) return `${Math.floor(diff_seconds / 60)}m`;
	if (diff_seconds < 86400) return `${Math.floor(diff_seconds / 3600)}h`;
	if (diff_seconds < 604800) return `${Math.floor(diff_seconds / 86400)}d`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function map_profile(
	user: NonNullable<Awaited<ReturnType<typeof get_profile_user_by_handle>>>,
	counts: { followers: number; following: number }
) {
	const created_at = user.createdAt as string;
	const joined_date = created_at
		? new Date(created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
		: 'Unknown';

	return {
		id: user.id as string,
		name: (user.name as string) || 'Unknown',
		handle: normalize_handle(user.username) || 'user',
		bio: (user.bio as string) || '',
		joined: `Joined ${joined_date}`,
		avatar: (user.image as string) || '',
		cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
		following: counts.following,
		followers: counts.followers
	};
}

export function map_profile_posts(
	posts_rows: Awaited<ReturnType<typeof get_profile_posts>>['rows'],
	user: NonNullable<Awaited<ReturnType<typeof get_profile_user_by_handle>>>
) {
	return posts_rows.map((row) => ({
		id: row.id as string,
		post_tag: row.post_tag as string,
		post_tags: [row.post_tag as string],
		posted_at: format_time_ago(row.created_at as string),
		author_name: (user.name as string) || 'Unknown',
		author_handle: normalize_handle(user.username) || 'user',
		content: row.content as string,
		audience: row.audience as string,
		author_bio: (user.bio as string) || '',
		verified: false,
		metrics: {
			likes: Number(row.like_count ?? 0),
			dislikes: Number(row.dislike_count ?? 0),
			reposts: Number(row.repost_count ?? 0)
		},
		user_liked: Boolean(row.user_liked),
		user_disliked: Boolean(row.user_disliked),
		user_reposted: Boolean(row.user_reposted),
		avatar_url: (user.image as string) || ''
	}));
}
