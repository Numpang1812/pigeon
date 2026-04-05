import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';
import { nanoid } from 'nanoid';

// eslint-disable-next-line @typescript-eslint/naming-convention
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

		// Toggle dislike
		const existing_dislike = await db.execute({
			sql: `SELECT id FROM dislike WHERE user_id = ? AND post_id = ?`,
			args: [session.user.id, post_id]
		});

		if (existing_dislike.rows.length > 0) {
			// Remove dislike
			await db.execute({
				sql: `DELETE FROM dislike WHERE id = ?`,
				args: [(existing_dislike.rows[0].id as string)]
			});
		} else {
			// Dislike — remove any existing like first (mutual exclusion)
			await db.execute({
				sql: `DELETE FROM like WHERE user_id = ? AND post_id = ?`,
				args: [session.user.id, post_id]
			});

			const dislike_id = nanoid();
			await db.execute({
				sql: `INSERT INTO dislike (id, user_id, post_id, created_at) VALUES (?, ?, ?, datetime('now'))`,
				args: [dislike_id, session.user.id, post_id]
			});
		}

		// Get updated counts
		const counts = await get_post_counts(post_id, session.user.id);

		return json({ success: true, ...counts }, { status: 200 });

	} catch (error) {
		console.error('[DISLIKE API] Error:', error);
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
