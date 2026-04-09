import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { nanoid } from 'nanoid';
import { postRepostLimiter } from '$lib/server/rate-limiter';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Rate limit: 1 repost per 2 seconds
		const rateLimit = postRepostLimiter.check(session.user.id, 1, 2_000);
		if (!rateLimit.allowed) {
			return json(
				{ error: `Too many reposts. Try again in ${Math.ceil(rateLimit.retryAfterMs! / 1000)}s.` },
				{ status: 429 }
			);
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

		// Toggle repost
		const existing_repost = await db.execute({
			sql: `SELECT id FROM repost WHERE user_id = ? AND post_id = ?`,
			args: [session.user.id, post_id]
		});

		if (existing_repost.rows.length > 0) {
			// Remove repost
			await db.execute({
				sql: `DELETE FROM repost WHERE id = ?`,
				args: [(existing_repost.rows[0].id as string)]
			});
		} else {
			// Repost
			const repost_id = nanoid();
			await db.execute({
				sql: `INSERT INTO repost (id, user_id, post_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
				args: [repost_id, session.user.id, post_id]
			});

			// Create notification if not own post
			const post_author_id = post_check.rows[0].author_id as string;
			if (post_author_id !== session.user.id) {
				const notification_id = nanoid();
				await db.execute({
					sql: `INSERT INTO notification (id, user_id, type, source_user_id, post_id, read, created_at)
						  VALUES (?, ?, 'follow', ?, ?, 0, datetime('now'))`,
					args: [notification_id, post_author_id, session.user.id, post_id]
				});
			}
		}

		// Get updated counts
		const counts = await get_post_counts(post_id, session.user.id);

		return json({ success: true, ...counts }, { status: 200 });

	} catch (error) {
		console.error('[REPOST API] Error:', error);
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
