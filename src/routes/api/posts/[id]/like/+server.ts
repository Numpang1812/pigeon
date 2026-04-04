import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ request, params }) => {
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

		// Check if post exists
		const post_check = await db.execute({
			sql: `SELECT id, author_id FROM post WHERE id = ?`,
			args: [post_id]
		});

		if (post_check.rows.length === 0) {
			return json({ error: 'Post not found' }, { status: 404 });
		}

		// Toggle like
		const existing_like = await db.execute({
			sql: `SELECT id FROM like WHERE user_id = ? AND post_id = ?`,
			args: [session.user.id, post_id]
		});

		if (existing_like.rows.length > 0) {
			// Unlike
			await db.execute({
				sql: `DELETE FROM like WHERE id = ?`,
				args: [(existing_like.rows[0].id as string)]
			});
		} else {
			// Like
			const like_id = nanoid();
			await db.execute({
				sql: `INSERT INTO like (id, user_id, post_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
				args: [like_id, session.user.id, post_id]
			});

			// Create notification if not own post
			const post_author_id = post_check.rows[0].author_id as string;
			if (post_author_id !== session.user.id) {
				const notification_id = nanoid();
				await db.execute({
					sql: `INSERT INTO notification (id, user_id, type, source_user_id, post_id, read, created_at)
						  VALUES (?, ?, 'like', ?, ?, 0, datetime('now'))`,
					args: [notification_id, post_author_id, session.user.id, post_id]
				});
			}
		}

		// Get updated counts
		const counts = await get_post_counts(post_id, session.user.id);

		return json({ success: true, ...counts }, { status: 200 });

	} catch (error) {
		console.error('[LIKE API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

async function get_post_counts(post_id: string, user_id: string) {
	const [likes_result, dislikes_result, reposts_result] = await Promise.all([
		db.execute({ sql: `SELECT COUNT(*) as count FROM like WHERE post_id = ?`, args: [post_id] }),
		db.execute({ sql: `SELECT COUNT(*) as count FROM dislike WHERE post_id = ?`, args: [post_id] }),
		db.execute({ sql: `SELECT COUNT(*) as count FROM repost WHERE post_id = ?`, args: [post_id] })
	]);

	const [user_like, user_dislike, user_repost] = await Promise.all([
		db.execute({ sql: `SELECT id FROM like WHERE user_id = ? AND post_id = ?`, args: [user_id, post_id] }),
		db.execute({ sql: `SELECT id FROM dislike WHERE user_id = ? AND post_id = ?`, args: [user_id, post_id] }),
		db.execute({ sql: `SELECT id FROM repost WHERE user_id = ? AND post_id = ?`, args: [user_id, post_id] })
	]);

	return {
		like_count: Number(likes_result.rows[0]?.count ?? 0),
		dislike_count: Number(dislikes_result.rows[0]?.count ?? 0),
		repost_count: Number(reposts_result.rows[0]?.count ?? 0),
		user_liked: user_like.rows.length > 0,
		user_disliked: user_dislike.rows.length > 0,
		user_reposted: user_repost.rows.length > 0
	};
}
