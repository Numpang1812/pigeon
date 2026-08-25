import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { normalize_handle } from '$lib';

export const load: PageServerLoad = async ({ request }) => {
	const session = await auth.api.getSession({
		headers: request.headers
	});

	if (!session) {
		throw redirect(302, '/');
	}

	// Fetch current user data from Turso
	const result = await db.execute({
		sql: 'SELECT id, name, username, bio, image, email FROM user WHERE id = ?',
		args: [session.user.id]
	});

	if (result.rows.length === 0) {
		throw redirect(302, '/');
	}

	const user = result.rows[0];

	return {
		profile: {
			id: user.id as string,
			name: user.name as string,
			username: normalize_handle(user.username) || '',
			bio: (user.bio as string) || '',
			avatar: user.image as string,
			email: user.email as string
		}
	};
};

export const actions: Actions = {
	profile: async ({ request }) => {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return fail(401, { message: 'Unauthorized' });
		}

		const data = await request.formData();
		const raw_name = data.get('name')?.toString() || '';
		const username = normalize_handle(data.get('username'));
		const raw_bio = data.get('bio')?.toString() || '';

		// Sanitize inputs: strip HTML tags and enforce length limits
		const name = raw_name.replace(/<[^>]*>/g, '').trim();
		const bio = raw_bio.replace(/<[^>]*>/g, '').trim();

		if (!name || name.length > 50) {
			return fail(400, { message: 'Name must be between 1 and 50 characters' });
		}

		if (bio.length > 160) {
			return fail(400, { message: 'Bio must be 160 characters or less' });
		}

		if (!username) {
			return fail(400, { message: 'Username is required' });
		}

		if (!/^[a-z0-9_]{2,15}$/.test(username)) {
			return fail(400, {
				message: 'Username must be 2-15 characters using only letters, numbers, or underscores.'
			});
		}

		try {
			const existing = await db.execute({
				sql: 'SELECT id FROM user WHERE lower(username) = lower(?) AND id != ? LIMIT 1',
				args: [username, session.user.id]
			});

			if (existing.rows.length > 0) {
				return fail(409, { message: 'Username is already taken' });
			}

			await db.execute({
				sql: 'UPDATE user SET name = ?, username = ?, bio = ? WHERE id = ?',
				args: [name, username, bio, session.user.id]
			});

			return { success: true, message: 'Profile updated successfully' };
		} catch (e: unknown) {
			console.error('Error updating profile:', e);
			return fail(500, { message: 'Failed to update profile' });
		}
	}
};
