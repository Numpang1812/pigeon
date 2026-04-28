import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { normalize_handle } from '$lib';

export const load: LayoutServerLoad = async ({ locals }) => {
	const is_authenticated = !!locals.user;
	let username_required = false;
	let current_user_image: string | null = null;
	let is_verified = false;

	if (is_authenticated && locals.user?.id) {
		const result = await db.execute({
			sql: 'SELECT username, image, verified, email, emailVerified FROM user WHERE id = ? LIMIT 1',
			args: [locals.user.id]
		});

		const row = result.rows[0];
		const username = normalize_handle(row?.username);
		username_required = username.length === 0;
		current_user_image = typeof row?.image === 'string' ? row.image : null;
		is_verified = Boolean(row?.verified);
		return {
			is_authenticated,
			username_required,
			current_user_image,
			is_verified,
			user_email: row?.email as string,
			email_verified: Boolean(row?.emailVerified)
		};
	}

	return {
		is_authenticated,
		username_required,
		current_user_image,
		is_verified,
		user_email: null,
		email_verified: true
	};
};
