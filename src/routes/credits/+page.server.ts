import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const target_usernames = ['numpang', 'hongnida', 'neath', 'leak'];
	const placeholders = target_usernames.map(() => '?').join(',');

	try {
		const result = await db.execute({
			sql: `
				SELECT name, username, image, verified 
				FROM user 
				WHERE username IN (${placeholders})
			`,
			args: target_usernames
		});

		return {
			team_users: result.rows as unknown as {
				name: string;
				username: string;
				image: string | null;
				verified: number | boolean | null;
			}[]
		};
	} catch (error) {
		console.error('[CREDITS API] Error fetching team members:', error);
		return {
			team_users: []
		};
	}
};
