import { db } from './db';
import { normalize_handle } from '$lib';

export type ProfileConnection = {
	id: string;
	name: string;
	handle: string;
	avatar: string;
	followed_at: string;
};

export async function get_profile_user_by_id(user_id: string) {
	const user_result = await db.execute({
		sql: 'SELECT id, name, username, bio, image, cover, createdAt FROM user WHERE id = ?',
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
		sql: 'SELECT id, name, username, bio, image, cover, createdAt FROM user WHERE lower(username) = lower(?) LIMIT 1',
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

export async function get_profile_followers(profile_user_id: string, limit = 12): Promise<ProfileConnection[]> {
	const result = await db.execute({
		sql: `
			SELECT
				u.id,
				u.name,
				u.username,
				u.image,
				f.created_at AS followed_at
			FROM follow f
			JOIN user u ON u.id = f.follower_id
			WHERE f.following_id = ?
			ORDER BY f.created_at DESC
			LIMIT ?
		`,
		args: [profile_user_id, limit]
	});

	return result.rows.map((row) => ({
		id: row.id as string,
		name: (row.name as string) || 'Unknown',
		handle: normalize_handle(row.username) || 'user',
		avatar: (row.image as string) || '',
		followed_at: row.followed_at as string
	}));
}

export async function get_profile_following(profile_user_id: string, limit = 12): Promise<ProfileConnection[]> {
	const result = await db.execute({
		sql: `
			SELECT
				u.id,
				u.name,
				u.username,
				u.image,
				f.created_at AS followed_at
			FROM follow f
			JOIN user u ON u.id = f.following_id
			WHERE f.follower_id = ?
			ORDER BY f.created_at DESC
			LIMIT ?
		`,
		args: [profile_user_id, limit]
	});

	return result.rows.map((row) => ({
		id: row.id as string,
		name: (row.name as string) || 'Unknown',
		handle: normalize_handle(row.username) || 'user',
		avatar: (row.image as string) || '',
		followed_at: row.followed_at as string
	}));
}

export async function toggle_follow_relationship(follower_id: string, following_id: string) {
	if (follower_id === following_id) {
		return { is_following: false, changed: false };
	}

	const existing_relationship = await db.execute({
		sql: 'SELECT id FROM follow WHERE follower_id = ? AND following_id = ? LIMIT 1',
		args: [follower_id, following_id]
	});

	if (existing_relationship.rows.length > 0) {
		await db.execute({
			sql: 'DELETE FROM follow WHERE id = ?',
			args: [existing_relationship.rows[0].id as string]
		});

		return { is_following: false, changed: true };
	}

	await db.execute({
		sql: 'INSERT INTO follow (id, follower_id, following_id, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
		args: [crypto.randomUUID(), follower_id, following_id]
	});

	return { is_following: true, changed: true };
}

export async function create_follow_notification(target_user_id: string, source_user_id: string): Promise<void> {
	if (target_user_id === source_user_id) return;

	const notification_id = crypto.randomUUID();
	await db.execute({
		sql: `INSERT INTO notification (id, user_id, type, source_user_id, read, created_at)
		      VALUES (?, ?, 'follow', ?, 0, datetime('now'))`,
		args: [notification_id, target_user_id, source_user_id]
	});
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

type ProfilePostMode = 'posts' | 'liked' | 'reposted';

function get_profile_posts_query_parts(mode: ProfilePostMode, is_owner: boolean) {
	if (mode === 'liked') {
		return {
			from_clause: 'FROM like l JOIN post p ON p.id = l.post_id JOIN user u ON p.author_id = u.id',
			where_clause: is_owner
				? 'WHERE l.user_id = ?'
				: "WHERE l.user_id = ? AND p.audience = 'public'",
			order_clause: 'ORDER BY l.created_at DESC'
		};
	}

	if (mode === 'reposted') {
		return {
			from_clause: 'FROM repost r JOIN post p ON p.id = r.post_id JOIN user u ON p.author_id = u.id',
			where_clause: is_owner
				? 'WHERE r.user_id = ?'
				: "WHERE r.user_id = ? AND p.audience = 'public'",
			order_clause: 'ORDER BY r.created_at DESC'
		};
	}

	return {
		from_clause: 'FROM post p JOIN user u ON p.author_id = u.id',
		where_clause: get_posts_where_clause(is_owner),
		order_clause: 'ORDER BY p.created_at DESC'
	};
}

export async function get_profile_posts(
	viewer_user_id: string,
	profile_user_id: string,
	is_owner: boolean,
	mode: ProfilePostMode = 'posts'
) {
	const { from_clause, where_clause, order_clause } = get_profile_posts_query_parts(mode, is_owner);

	return db.execute({
		sql: `SELECT p.id, p.content, p.post_tag, p.audience, p.created_at, p.author_id, p.updated_at,
			u.name as author_name, u.username as author_handle, u.bio as author_bio, u.image as author_avatar,
			(SELECT GROUP_CONCAT(h.tag_name, ',') FROM post_hashtag ph JOIN hashtag h ON ph.hashtag_id = h.id WHERE ph.post_id = p.id) as hashtag_list,
			(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
			(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
			(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count,
			(SELECT COUNT(*) > 0 FROM like WHERE post_id = p.id AND user_id = ?) as user_liked,
			(SELECT COUNT(*) > 0 FROM dislike WHERE post_id = p.id AND user_id = ?) as user_disliked,
			(SELECT COUNT(*) > 0 FROM repost WHERE post_id = p.id AND user_id = ?) as user_reposted
			${from_clause}
			${where_clause}
			${order_clause}
			LIMIT 50`,
		args: [viewer_user_id, viewer_user_id, viewer_user_id, profile_user_id]
	});
}

export async function get_profile_post_sections(
	viewer_user_id: string,
	profile_user_id: string,
	is_owner: boolean,
	user: NonNullable<Awaited<ReturnType<typeof get_profile_user_by_handle>>>
) {
	const [posts_result, reposted_posts_result, liked_posts_result] = await Promise.all([
		get_profile_posts(viewer_user_id, profile_user_id, is_owner, 'posts'),
		get_profile_posts(viewer_user_id, profile_user_id, is_owner, 'reposted'),
		get_profile_posts(viewer_user_id, profile_user_id, is_owner, 'liked')
	]);

	return {
		posts: map_profile_posts(posts_result.rows, user, viewer_user_id),
		reposted_posts: map_profile_posts(reposted_posts_result.rows, user, viewer_user_id),
		liked_posts: map_profile_posts(liked_posts_result.rows, user, viewer_user_id)
	};
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
		cover: (user.cover as string) || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
		following: counts.following,
		followers: counts.followers
	};
}

export function map_profile_posts(
	posts_rows: Awaited<ReturnType<typeof get_profile_posts>>['rows'],
	user: NonNullable<Awaited<ReturnType<typeof get_profile_user_by_handle>>>,
	viewer_user_id?: string
) {
	return posts_rows.map((row) => ({
		id: row.id as string,
		post_tag: row.post_tag as string,
		post_tags:
			typeof row.hashtag_list === 'string' && row.hashtag_list.length > 0
				? row.hashtag_list
						.split(',')
						.map((tag) => tag.trim().toLowerCase())
						.filter((tag) => tag.length > 0)
				: [row.post_tag as string],
		posted_at: format_time_ago(row.created_at as string),
		author_name: (row.author_name as string) || (user.name as string) || 'Unknown',
		author_handle: normalize_handle(row.author_handle) || normalize_handle(user.username) || 'user',
		content: row.content as string,
		audience: row.audience as string,
		author_bio: (row.author_bio as string) || (user.bio as string) || '',
		verified: false,
		metrics: {
			likes: Number(row.like_count ?? 0),
			dislikes: Number(row.dislike_count ?? 0),
			reposts: Number(row.repost_count ?? 0)
		},
		user_liked: Boolean(row.user_liked),
		user_disliked: Boolean(row.user_disliked),
		user_reposted: Boolean(row.user_reposted),
		avatar_url: (row.author_avatar as string) || (user.image as string) || '',
		is_author: row.author_id === viewer_user_id,
		is_edited: row.updated_at !== row.created_at
	}));
}
