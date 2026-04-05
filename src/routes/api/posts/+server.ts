import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { nanoid } from 'nanoid';

function normalize_tag(raw_tag: unknown): string | null {
	if (typeof raw_tag !== 'string') {
		return null;
	}

	const normalized = raw_tag.trim().toLowerCase().replace(/^#+/, '');
	if (!/^[a-z0-9_]{2,24}$/.test(normalized)) {
		return null;
	}

	return normalized;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { content, audience, post_tag, post_tags, media } = body;

		// Validation
		if (!content || typeof content !== 'string' || content.trim().length === 0) {
			return json({ error: 'Content is required' }, { status: 400 });
		}

		if (content.length > 280) {
			return json({ error: 'Content must be 280 characters or less' }, { status: 400 });
		}

		const valid_audiences = ['public', 'followers_friends', 'close_friends', 'private'];
		const validated_audience = valid_audiences.includes(audience) ? audience : 'public';

		const normalized_tags = Array.isArray(post_tags)
			? Array.from(
					new Set(
						post_tags
							.map((tag) => normalize_tag(tag))
							.filter((tag): tag is string => tag !== null)
					)
			  ).slice(0, 6)
			: [];

		const normalized_primary = normalize_tag(post_tag);
		const validated_post_tag = normalized_tags[0] ?? normalized_primary ?? 'other';

		// Create post
		const post_id = nanoid();
		await db.execute({
			sql: `INSERT INTO post (id, author_id, content, audience, post_tag, created_at, updated_at)
				  VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
			args: [post_id, session.user.id, content.trim(), validated_audience, validated_post_tag]
		});

		// Add media if provided
		if (media && Array.isArray(media)) {
			for (const media_item of media) {
				const media_id = nanoid();
				await db.execute({
					sql: `INSERT INTO post_media (id, post_id, media_url, media_type, s3_key, created_at)
						  VALUES (?, ?, ?, ?, ?, datetime('now'))`,
					args: [
						media_id,
						post_id,
						media_item.url,
						media_item.type || 'image',
						media_item.key || '',
					]
				});
			}
		}

		// Handle hashtags
		if (normalized_tags.length > 0) {
			for (const tag of normalized_tags) {
				// Insert or update hashtag
				await db.execute({
					sql: `INSERT INTO hashtag (id, tag_name, usage_count)
						  VALUES (?, ?, 1)
						  ON CONFLICT(tag_name) DO UPDATE SET usage_count = usage_count + 1`,
					args: [nanoid(), tag]
				});

				// Get hashtag ID
				const hashtag_result = await db.execute({
					sql: `SELECT id FROM hashtag WHERE tag_name = ?`,
					args: [tag]
				});

				if (hashtag_result.rows.length > 0) {
					const hashtag_id = hashtag_result.rows[0].id as string;
					// Link post to hashtag
					await db.execute({
						sql: `INSERT OR IGNORE INTO post_hashtag (post_id, hashtag_id)
							  VALUES (?, ?)`,
						args: [post_id, hashtag_id]
					});
				}
			}
		}

		// Fetch the created post with author info
		const post_result = await db.execute({
			sql: `SELECT 
				p.id,
				p.content,
				p.audience,
				p.post_tag,
				p.created_at,
				p.updated_at,
				u.name as author_name,
				u.username as author_handle,
				u.image as author_avatar,
				u.bio as author_bio,
				0 as like_count,
				0 as dislike_count,
				0 as repost_count
			FROM post p
			JOIN user u ON p.author_id = u.id
			WHERE p.id = ?`,
			args: [post_id]
		});

		if (post_result.rows.length === 0) {
			return json({ error: 'Failed to create post' }, { status: 500 });
		}

		const post = post_result.rows[0];
		
		return json({
			success: true,
			post: {
				id: post.id as string,
				content: post.content as string,
				audience: post.audience as string,
				post_tag: post.post_tag as string,
				post_tags: normalized_tags.length > 0 ? normalized_tags : [post.post_tag as string],
				posted_at: format_time_ago(post.created_at as string),
				author_name: post.author_name as string,
				author_handle: post.author_handle as string,
				author_bio: post.author_bio as string,
				avatar_url: post.author_avatar as string,
				verified: false,
				metrics: {
					likes: Number(post.like_count),
					dislikes: Number(post.dislike_count),
					reposts: Number(post.repost_count)
				}
			}
		}, { status: 201 });

	} catch (error) {
		console.error('[POST API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Check if fetching user-specific posts
		const user_id = url.searchParams.get('user_id');
		const tag = url.searchParams.get('tag');
		const post_id = url.searchParams.get('post_id');
		const limit = parseInt(url.searchParams.get('limit') || '50');
		const offset = parseInt(url.searchParams.get('offset') || '0');

		let query = `
			SELECT 
				p.id,
				p.content,
				p.audience,
				p.post_tag,
				p.created_at,
				p.updated_at,
				u.name as author_name,
				u.username as author_handle,
				u.image as author_avatar,
				u.bio as author_bio,
				(SELECT GROUP_CONCAT(h.tag_name, ',')
				 FROM post_hashtag ph
				 JOIN hashtag h ON ph.hashtag_id = h.id
				 WHERE ph.post_id = p.id) as hashtag_list,
				(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
				(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
				(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count,
				EXISTS(SELECT 1 FROM like WHERE post_id = p.id AND user_id = ?) as user_liked,
				EXISTS(SELECT 1 FROM dislike WHERE post_id = p.id AND user_id = ?) as user_disliked,
				EXISTS(SELECT 1 FROM repost WHERE post_id = p.id AND user_id = ?) as user_reposted
			FROM post p
			JOIN user u ON p.author_id = u.id
		`;

		const args: any[] = [session.user.id, session.user.id, session.user.id];
		const where_clauses: string[] = [];

		if (user_id) {
			where_clauses.push(`p.author_id = ?`);
			args.push(user_id);
		} else {
			where_clauses.push(`p.audience = 'public'`);
		}

		if (!user_id && tag && tag !== 'foryou' && tag !== 'trending') {
			if (tag === 'other') {
				where_clauses.push(`p.post_tag = 'other'`);
			} else {
				where_clauses.push(`EXISTS (
					SELECT 1 FROM post_hashtag ph 
					JOIN hashtag h ON ph.hashtag_id = h.id 
					WHERE ph.post_id = p.id AND h.tag_name = ?
				)`);
				args.push(tag);
			}
		}

		if (where_clauses.length > 0) {
			query += ` WHERE ` + where_clauses.join(' AND ');
		}

		if (tag === 'trending') {
			query += ` ORDER BY like_count DESC, p.created_at DESC LIMIT ? OFFSET ?`;
		} else {
			query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
		}

		args.push(limit, offset);

		const posts_result = await db.execute({ sql: query, args });
		const rows = [...posts_result.rows];

		if (post_id && !user_id && !rows.some((row) => (row.id as string) === post_id)) {
			const target_post_result = await db.execute({
				sql: `
					SELECT
						p.id,
						p.content,
						p.audience,
						p.post_tag,
						p.created_at,
						p.updated_at,
						u.name as author_name,
						u.username as author_handle,
						u.image as author_avatar,
						u.bio as author_bio,
						(SELECT GROUP_CONCAT(h.tag_name, ',')
						 FROM post_hashtag ph
						 JOIN hashtag h ON ph.hashtag_id = h.id
						 WHERE ph.post_id = p.id) as hashtag_list,
						(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
						(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
						(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count,
						EXISTS(SELECT 1 FROM like WHERE post_id = p.id AND user_id = ?) as user_liked,
						EXISTS(SELECT 1 FROM dislike WHERE post_id = p.id AND user_id = ?) as user_disliked,
						EXISTS(SELECT 1 FROM repost WHERE post_id = p.id AND user_id = ?) as user_reposted
					FROM post p
					JOIN user u ON p.author_id = u.id
					WHERE p.id = ?
					  AND (p.audience = 'public' OR p.author_id = ?)
					LIMIT 1
				`,
				args: [session.user.id, session.user.id, session.user.id, post_id, session.user.id]
			});

			if (target_post_result.rows.length > 0) {
				rows.push(target_post_result.rows[0]);
				rows.sort((a, b) => {
					const a_time = new Date(String(a.created_at) + 'Z').getTime();
					const b_time = new Date(String(b.created_at) + 'Z').getTime();
					return b_time - a_time;
				});
			}
		}

		const posts = rows.map((row) => {
			const hashtag_list = (row.hashtag_list as string | null) ?? '';
			const parsed_tags = hashtag_list
				.split(',')
				.map((tag) => tag.trim().toLowerCase())
				.filter((tag) => tag.length > 0);

			return {
			id: row.id as string,
			content: row.content as string,
			audience: row.audience as string,
			post_tag: row.post_tag as string,
			post_tags: parsed_tags.length > 0 ? parsed_tags : [row.post_tag as string],
			posted_at: format_time_ago(row.created_at as string),
			author_name: row.author_name as string,
			author_handle: row.author_handle as string,
			author_bio: row.author_bio as string,
			avatar_url: row.author_avatar as string,
			verified: false,
			metrics: {
				likes: Number(row.like_count),
				dislikes: Number(row.dislike_count),
				reposts: Number(row.repost_count)
			},
			user_liked: Boolean(row.user_liked),
			user_disliked: Boolean(row.user_disliked),
			user_reposted: Boolean(row.user_reposted)
		};
		});

		return json({ success: true, posts }, { status: 200 });

	} catch (error) {
		console.error('[POSTS API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

function format_time_ago(date_string: string): string {
	// SQLite stores timestamps in UTC without timezone indicator
	// Append 'Z' to ensure JavaScript treats it as UTC
	const date = new Date(date_string + 'Z');
	const now = new Date();
	const diff_seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diff_seconds < 60) return `${diff_seconds}s`;
	if (diff_seconds < 3600) return `${Math.floor(diff_seconds / 60)}m`;
	if (diff_seconds < 86400) return `${Math.floor(diff_seconds / 3600)}h`;
	if (diff_seconds < 604800) return `${Math.floor(diff_seconds / 86400)}d`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
