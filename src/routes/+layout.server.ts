import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { normalize_handle } from '$lib';

export const load: LayoutServerLoad = async ({ locals }) => {
	const is_authenticated = !!locals.user;
	let username_required = false;

	if (is_authenticated && locals.user?.id) {
		const result = await db.execute({
			sql: 'SELECT username FROM user WHERE id = ? LIMIT 1',
			args: [locals.user.id]
		});

		const row = result.rows[0];
		const username = normalize_handle(row?.username);
		username_required = username.length === 0;
	}

	return {
		is_authenticated,
		username_required
	};
};
