import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const q = url.searchParams.get('q');
		if (!q) return json({ users: [] });

		let query_term = q.trim();
		if (query_term.startsWith('@')) {
			query_term = query_term.substring(1);
		}

		if (query_term === '') {
			return json({ users: [] });
		}

		const search_term = `%${query_term}%`;
		const result = await db.execute({
			sql: `
				SELECT id, name, username, image 
				FROM user 
				WHERE name LIKE ? OR username LIKE ? 
				LIMIT 10
			`,
			args: [search_term, search_term]
		});

		return json({
			users: result.rows
		});
	} catch (error) {
		console.error('[USER SEARCH API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
