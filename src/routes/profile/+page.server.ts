import type { PageServerLoad } from './$types';
import { db, ensure_schema } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth';

export const load: PageServerLoad = async ({ request }) => {
	// Ensure database schema is initialized
	await ensure_schema();

	const session = await auth.api.getSession({
		headers: request.headers
	});

	if (!session) {
		throw redirect(302, '/');
	}

	// Fetch user profile from Turso
	const user_result = await db.execute({
		sql: 'SELECT id, name, username, bio, image, email, createdAt FROM user WHERE id = ?',
		args: [session.user.id]
	});

	if (user_result.rows.length === 0) {
		throw redirect(302, '/');
	}

	const user = user_result.rows[0];

	// Fetch follower/following counts
	const followers_result = await db.execute({
		sql: 'SELECT COUNT(*) as count FROM follow WHERE following_id = ?',
		args: [session.user.id]
	});

	const following_result = await db.execute({
		sql: 'SELECT COUNT(*) as count FROM follow WHERE follower_id = ?',
		args: [session.user.id]
	});

	// Fetch user's posts
	const posts_result = await db.execute({
		sql: `SELECT p.id, p.content, p.post_tag, p.audience, p.created_at,
			(SELECT COUNT(*) FROM like WHERE post_id = p.id) as like_count,
			(SELECT COUNT(*) FROM dislike WHERE post_id = p.id) as dislike_count,
			(SELECT COUNT(*) FROM repost WHERE post_id = p.id) as repost_count
			FROM post p
			WHERE p.author_id = ?
			ORDER BY p.created_at DESC
			LIMIT 50`,
		args: [session.user.id]
	});

	const created_at = user.createdAt as string;
	const joined_date = created_at
		? new Date(created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
		: 'Unknown';

	return {
		profile: {
			id: user.id as string,
			name: (user.name as string) || 'Unknown',
			handle: (user.username as string) || 'user',
			bio: (user.bio as string) || '',
			joined: `Joined ${joined_date}`,
			avatar: (user.image as string) || '',
			cover: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
			following: Number(following_result.rows[0]?.count ?? 0),
			followers: Number(followers_result.rows[0]?.count ?? 0)
		},
		posts: posts_result.rows.map((row) => ({
			id: row.id as string,
			post_tag: row.post_tag as string,
			post_tags: [row.post_tag as string],
			posted_at: format_time_ago(row.created_at as string),
			author_name: (user.name as string) || 'Unknown',
			author_handle: (user.username as string) || 'user',
			content: row.content as string,
			audience: row.audience as string,
			author_bio: (user.bio as string) || '',
			verified: false,
			metrics: { 
				likes: Number(row.like_count ?? 0), 
				dislikes: Number(row.dislike_count ?? 0),
				reposts: Number(row.repost_count ?? 0)
			},
			avatar_url: (user.image as string) || ''
		}))
	};
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
