import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { post_edit_limiter } from '$lib/server/rate-limiter';

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
		const { content } = body;

		if (!content || typeof content !== 'string' || content.trim().length === 0) {
			return json({ error: 'Content is required' }, { status: 400 });
		}

		if (content.length > 280) {
			return json({ error: 'Content must be 280 characters or less' }, { status: 400 });
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

		// Update the post
		await db.execute({
			sql: `UPDATE post SET content = ?, updated_at = datetime('now') WHERE id = ?`,
			args: [content.trim(), post_id]
		});

		return json({ 
			success: true, 
			message: 'Post updated successfully',
			content: content.trim()
		});
	} catch (error) {
		console.error('[PATCH POST API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
