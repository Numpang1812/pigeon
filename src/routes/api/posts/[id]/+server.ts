import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { post_edit_limiter } from '$lib/server/rate-limiter';
import { extract_post_tags, limit_post_tags, strip_detected_tags_from_content } from '$lib/post-tags';

function normalize_tag(raw_tag: unknown): string | null {
	if (typeof raw_tag !== 'string') return null;
	const normalized = raw_tag.trim().toLowerCase().replace(/^#+/, '');
	return /^[\p{L}\p{N}_]+$/u.test(normalized) ? normalized : null;
}

function normalize_post_content(raw_content: string): string {
	return raw_content.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function validate_edit_content(raw_content: unknown): string | null {
	if (typeof raw_content !== 'string') return null;
	const trimmed = raw_content.trim();
	if (trimmed.length === 0 || trimmed.length > 280) return null;
	return normalize_post_content(raw_content);
}

async function get_authorized_post(post_id: string, user_id: string) {
	const post_result = await db.execute({
		sql: `SELECT author_id FROM post WHERE id = ?`,
		args: [post_id]
	});

	if (post_result.rows.length === 0) {
		return { error: 'not_found' as const };
	}

	const post = post_result.rows[0];
	if (post.author_id !== user_id) {
		return { error: 'forbidden' as const };
	}

	return { post };
}

async function get_post_tags(post_id: string): Promise<string[]> {
	const existing_tags_result = await db.execute({
		sql: `SELECT h.tag_name
			  FROM post_hashtag ph
			  JOIN hashtag h ON ph.hashtag_id = h.id
			  WHERE ph.post_id = ?`,
		args: [post_id]
	});

	return existing_tags_result.rows
		.map((row) => normalize_tag(row.tag_name))
		.filter((tag): tag is string => tag !== null);
}

async function add_post_hashtag(post_id: string, tag: string): Promise<void> {
	await db.execute({
		sql: `INSERT INTO hashtag (id, tag_name, usage_count)
			  VALUES (lower(hex(randomblob(16))), ?, 1)
			  ON CONFLICT(tag_name) DO UPDATE SET usage_count = usage_count + 1`,
		args: [tag]
	});

	const hashtag_result = await db.execute({
		sql: `SELECT id FROM hashtag WHERE tag_name = ?`,
		args: [tag]
	});

	if (hashtag_result.rows.length > 0) {
		await db.execute({
			sql: `INSERT OR IGNORE INTO post_hashtag (post_id, hashtag_id) VALUES (?, ?)`,
			args: [post_id, hashtag_result.rows[0].id as string]
		});
	}
}

async function remove_post_hashtag(post_id: string, tag: string): Promise<void> {
	const hashtag_result = await db.execute({
		sql: `SELECT id FROM hashtag WHERE tag_name = ?`,
		args: [tag]
	});

	if (hashtag_result.rows.length === 0) {
		return;
	}

	const hashtag_id = hashtag_result.rows[0].id as string;

	await db.execute({
		sql: `DELETE FROM post_hashtag WHERE post_id = ? AND hashtag_id = ?`,
		args: [post_id, hashtag_id]
	});

	await db.execute({
		sql: `UPDATE hashtag
			  SET usage_count = CASE WHEN usage_count > 0 THEN usage_count - 1 ELSE 0 END
			  WHERE id = ?`,
		args: [hashtag_id]
	});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const DELETE: RequestHandler = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const post_id = params.id;
		if (!post_id) {
			return json({ error: 'Post ID is required' }, { status: 400 });
		}

		// Check if post exists and user is author
		const post_result = await db.execute({
			sql: `SELECT author_id FROM post WHERE id = ?`,
			args: [post_id]
		});

		if (post_result.rows.length === 0) {
			return json({ error: 'Post not found' }, { status: 404 });
		}

		const post = post_result.rows[0];
		if (post.author_id !== session.user.id) {
			return json({ error: 'Forbidden: You are not the author of this post' }, { status: 403 });
		}

		// Delete the post
		await db.execute({
			sql: `DELETE FROM post WHERE id = ?`,
			args: [post_id]
		});

		return json({ success: true, message: 'Post deleted successfully' });
	} catch (error) {
		console.error('[DELETE POST API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Rate limit: 1 edit per 3 seconds
		const rate_limit = post_edit_limiter.check(session.user.id, 1, 3_000);
		if (!rate_limit.allowed) {
			return json(
				{ error: `Too many edits. Try again in ${Math.ceil(rate_limit.retry_after_ms! / 1000)}s.` },
				{ status: 429 }
			);
		}

		const post_id = params.id;
		if (!post_id) {
			return json({ error: 'Post ID is required' }, { status: 400 });
		}

		const body = await request.json();
		const content = validate_edit_content(body.content);
		if (!content) {
			return json({ error: 'Content is required' }, { status: 400 });
		}

		const authorization = await get_authorized_post(post_id, session.user.id);
		if (authorization.error === 'not_found') {
			return json({ error: 'Post not found' }, { status: 404 });
		}
		if (authorization.error === 'forbidden') {
			return json({ error: 'Forbidden: You are not the author of this post' }, { status: 403 });
		}

		// Update the post
		const normalized_content = content;
		const extracted_tags = extract_post_tags(normalized_content);
		const payload_tags = Array.isArray(body.post_tags) ? limit_post_tags(body.post_tags) : [];
		const normalized_tags = payload_tags.length > 0 ? payload_tags : extracted_tags;
		const sanitized_content = strip_detected_tags_from_content(normalized_content);

		if (sanitized_content.length === 0) {
			return json({ error: 'Content is required' }, { status: 400 });
		}

		const validated_post_tag = normalized_tags[0] ?? 'other';

		const previous_tags = await get_post_tags(post_id);
		const previous_tags_set = new Set(previous_tags);
		const next_tags_set = new Set(normalized_tags);

		const tags_to_remove = previous_tags.filter((tag) => !next_tags_set.has(tag));
		const tags_to_add = normalized_tags.filter((tag) => !previous_tags_set.has(tag));

		await db.execute({
			sql: `UPDATE post SET content = ?, post_tag = ?, updated_at = datetime('now') WHERE id = ?`,
			args: [sanitized_content, validated_post_tag, post_id]
		});

		for (const tag of tags_to_remove) {
			await remove_post_hashtag(post_id, tag);
		}

		for (const tag of tags_to_add) {
			await add_post_hashtag(post_id, tag);
		}

		return json({ 
			success: true, 
			message: 'Post updated successfully',
			content: sanitized_content,
			post_tag: validated_post_tag,
			post_tags: normalized_tags.length > 0 ? normalized_tags : ['other']
		});
	} catch (error) {
		console.error('[PATCH POST API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
