import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { normalize_handle } from '$lib';

export const load: LayoutServerLoad = async ({ locals }) => {
	const is_authenticated = !!locals.user;
	let username_required = false;
	let current_user_image: string | null = null;

	if (is_authenticated && locals.user?.id) {
		const result = await db.execute({
			sql: 'SELECT username, image FROM user WHERE id = ? LIMIT 1',
			args: [locals.user.id]
		});

		const row = result.rows[0];
		const username = normalize_handle(row?.username);
		username_required = username.length === 0;
		current_user_image = typeof row?.image === 'string' ? row.image : null;
	}

	return {
		is_authenticated,
		username_required,
		current_user_image
	};
};
