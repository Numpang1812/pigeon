import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auth } from '$lib/auth';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const result = await db.execute({
			sql: `
				SELECT tag_name as id, tag_name as label, usage_count 
				FROM hashtag 
				ORDER BY usage_count DESC 
				LIMIT 10
			`,
			args: []
		});

		return json({
			tags: result.rows
		});
	} catch (error) {
		console.error('[POPULAR TAGS API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
