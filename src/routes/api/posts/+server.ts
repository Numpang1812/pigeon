import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { nanoid } from 'nanoid';

function normalize_tag(raw_tag: unknown): string | null {
	if (typeof raw_tag !== 'string') return null;
	const normalized = raw_tag.trim().toLowerCase().replace(/^#+/, '');
	return /^[a-z0-9_]{2,24}$/.test(normalized) ? normalized : null;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

		const body = await request.json();
		const validation = validate_post_input(body);
		if (validation.error) return json({ error: validation.error }, { status: 400 });

		const { content, audience, normalized_tags, validated_post_tag } = validation;
		if (!content || !audience || !validated_post_tag) return json({ error: 'Invalid input' }, { status: 400 });

		const post_id = nanoid();
		await db.execute({
			sql: `INSERT INTO post (id, author_id, content, audience, post_tag, created_at, updated_at)
				  VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
			args: [post_id, session.user.id, content.trim(), audience, validated_post_tag]
		});

		if (body.media) await handle_post_media(post_id, body.media);
		if (normalized_tags && normalized_tags.length > 0) await handle_post_hashtags(post_id, normalized_tags);

		const post = await fetch_created_post(post_id);
		if (!post) return json({ error: 'Failed to create post' }, { status: 500 });

		return json({
			success: true,
			post: map_post_row(post, session.user.id, normalized_tags)
		}, { status: 201 });
	} catch (error) {
		console.error('[POST API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ url, request }) => {
	try {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return json({ error: 'Unauthorized' }, { status: 401 });

		const { query, args } = build_posts_query(url, session.user.id);
		const posts_result = await db.execute({ sql: query, args });
		const rows = [...posts_result.rows];

		const post_id = url.searchParams.get('post_id');
		if (post_id && !url.searchParams.get('user_id') && !rows.some((r) => r.id === post_id)) {
			const target = await fetch_specific_post(post_id, session.user.id);
			if (target) {
				rows.push(target);
				rows.sort((a, b) => new Date(String(b.created_at) + 'Z').getTime() - new Date(String(a.created_at) + 'Z').getTime());
			}
		}

		return json({ success: true, posts: rows.map(r => map_post_row(r, session.user.id)) }, { status: 200 });
	} catch (error) {
		console.error('[POSTS API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

interface PostInput {
	error?: string;
	content?: string;
	audience?: string;
	normalized_tags?: string[];
	validated_post_tag?: string;
}

function validate_post_input(body: Record<string, unknown>): PostInput {
	const { content, audience, post_tag, post_tags } = body;
	if (!content || typeof content !== 'string' || content.trim().length === 0) {
		return { error: 'Content is required' };
	}
	if (content.length > 280) {
		return { error: 'Content must be 280 characters or less' };
	}

	const valid_audiences = ['public', 'followers_friends', 'close_friends', 'private'];
	const validated_audience = typeof audience === 'string' && valid_audiences.includes(audience) ? audience : 'public';

	const normalized_tags = Array.isArray(post_tags)
		? Array.from(new Set(post_tags.map(normalize_tag).filter((t): t is string => t !== null))).slice(0, 6)
		: [];

	const normalized_primary = normalize_tag(post_tag);
	const validated_post_tag = normalized_tags[0] ?? normalized_primary ?? 'other';

	return { content, audience: validated_audience, normalized_tags, validated_post_tag };
}

async function handle_post_media(post_id: string, media: unknown[]) {
	if (!Array.isArray(media)) return;
	for (const item_raw of media) {
		const item = item_raw as { url: string; type?: string; key?: string };
		await db.execute({
			sql: `INSERT INTO post_media (id, post_id, media_url, media_type, s3_key, created_at)
				  VALUES (?, ?, ?, ?, ?, datetime('now'))`,
			args: [nanoid(), post_id, item.url, item.type || 'image', item.key || '']
		});
	}
}

async function handle_post_hashtags(post_id: string, tags: string[]) {
	for (const tag of tags) {
		await db.execute({
			sql: `INSERT INTO hashtag (id, tag_name, usage_count)
				  VALUES (?, ?, 1) ON CONFLICT(tag_name) DO UPDATE SET usage_count = usage_count + 1`,
			args: [nanoid(), tag]
		});
		const result = await db.execute({ sql: `SELECT id FROM hashtag WHERE tag_name = ?`, args: [tag] });
		if (result.rows.length > 0) {
			await db.execute({
				sql: `INSERT OR IGNORE INTO post_hashtag (post_id, hashtag_id) VALUES (?, ?)`,
				args: [post_id, result.rows[0].id as string]
			});
		}
	}
}

async function fetch_created_post(post_id: string) {
	const result = await db.execute({
		sql: `SELECT p.*, u.name as author_name, u.username as author_handle, u.image as author_avatar, u.bio as author_bio
			  FROM post p JOIN user u ON p.author_id = u.id WHERE p.id = ?`,
		args: [post_id]
	});
	return result.rows[0] as unknown as Record<string, unknown>;
}

function map_post_row(row_raw: unknown, current_user_id: string, tags: string[] = []) {
	const row = row_raw as Record<string, unknown>;
	const hashtag_list = (row.hashtag_list as string | null) ?? '';
	const parsed_tags = tags.length > 0 ? tags : 
		hashtag_list.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0);

	return {
		id: row.id as string,
		content: row.content as string,
		audience: row.audience as string,
		post_tag: row.post_tag as string,
		post_tags: parsed_tags.length > 0 ? parsed_tags : [row.post_tag as string],
		posted_at: format_time_ago(row.created_at as string),
		author_name: row.author_name as string,
		author_handle: (row.author_handle as string) || 'user',
		author_bio: row.author_bio as string,
		avatar_url: row.author_avatar as string,
		verified: false,
		metrics: {
			likes: Number(row.like_count || 0),
			dislikes: Number(row.dislike_count || 0),
			reposts: Number(row.repost_count || 0)
		},
		is_author: row.author_id === current_user_id,
		is_edited: row.updated_at && row.updated_at !== row.created_at,
		user_liked: Boolean(row.user_liked),
		user_disliked: Boolean(row.user_disliked),
		user_reposted: Boolean(row.user_reposted)
	};
}

function build_posts_query(url: URL, current_user_id: string) {
	const user_id = url.searchParams.get('user_id');
	const tag = url.searchParams.get('tag');
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const offset = parseInt(url.searchParams.get('offset') || '0');

	let query = `
		SELECT p.*, u.name as author_name, u.username as author_handle, u.image as author_avatar, u.bio as author_bio,
			(SELECT GROUP_CONCAT(h.tag_name, ',') FROM post_hashtag ph JOIN hashtag h ON ph.hashtag_id = h.id WHERE ph.post_id = p.id) as hashtag_list,
			(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
			(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
			(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count,
			EXISTS(SELECT 1 FROM like WHERE post_id = p.id AND user_id = ?) as user_liked,
			EXISTS(SELECT 1 FROM dislike WHERE post_id = p.id AND user_id = ?) as user_disliked,
			EXISTS(SELECT 1 FROM repost WHERE post_id = p.id AND user_id = ?) as user_reposted
		FROM post p JOIN user u ON p.author_id = u.id`;

	const args: (string | number)[] = [current_user_id, current_user_id, current_user_id];
	const where: string[] = [];

	if (user_id) {
		where.push('p.author_id = ?');
		args.push(user_id);
	} else {
		where.push(`(
			p.audience = 'public'
			OR (p.audience = 'followers_friends' AND p.author_id IN (SELECT following_id FROM follow WHERE follower_id = ?))
			OR p.author_id = ?
		)`);
		args.push(current_user_id, current_user_id);
	}

	if (!user_id && tag && !['foryou', 'trending'].includes(tag)) {
		if (tag === 'other') {
			where.push("p.post_tag = 'other'");
		} else {
			where.push("EXISTS (SELECT 1 FROM post_hashtag ph JOIN hashtag h ON ph.hashtag_id = h.id WHERE ph.post_id = p.id AND h.tag_name = ?)");
			args.push(tag);
		}
	}

	if (where.length > 0) query += ' WHERE ' + where.join(' AND ');
	query += tag === 'trending' ? ' ORDER BY like_count DESC, p.created_at DESC' : ' ORDER BY p.created_at DESC';
	query += ' LIMIT ? OFFSET ?';
	args.push(limit, offset);

	return { query, args };
}

async function fetch_specific_post(post_id: string, current_user_id: string) {
	const result = await db.execute({
		sql: `SELECT p.*, u.name as author_name, u.username as author_handle, u.image as author_avatar, u.bio as author_bio,
				(SELECT GROUP_CONCAT(h.tag_name, ',') FROM post_hashtag ph JOIN hashtag h ON ph.hashtag_id = h.id WHERE ph.post_id = p.id) as hashtag_list,
				(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
				(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
				(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count,
				EXISTS(SELECT 1 FROM like WHERE post_id = p.id AND user_id = ?) as user_liked,
				EXISTS(SELECT 1 FROM dislike WHERE post_id = p.id AND user_id = ?) as user_disliked,
				EXISTS(SELECT 1 FROM repost WHERE post_id = p.id AND user_id = ?) as user_reposted
			  FROM post p JOIN user u ON p.author_id = u.id
			  WHERE p.id = ? AND (
					p.audience = 'public'
					OR (p.audience = 'followers_friends' AND p.author_id IN (SELECT following_id FROM follow WHERE follower_id = ?))
					OR p.author_id = ?
			  )`,
		args: [current_user_id, current_user_id, current_user_id, post_id, current_user_id, current_user_id]
	});
	return result.rows[0];
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
