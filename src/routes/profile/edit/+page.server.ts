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
		const name = data.get('name')?.toString() || '';
		const username = normalize_handle(data.get('username'));
		const bio = data.get('bio')?.toString() || '';

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
	},
	password: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return fail(401, { message: 'Unauthorized' });

		const data = await request.formData();
		const validation = validate_password_data(data);
		if (validation.error) return fail(400, { message: validation.error });

		try {
			await auth.api.changePassword({
				body: {
					newPassword: validation.new_password!,
					currentPassword: validation.current_password!
				},
				headers: request.headers
			});
			return { success: true, message: 'Password updated successfully' };
		} catch (e: unknown) {
			return handle_password_error(e);
		}
	}
};

function validate_password_data(data: FormData) {
	const current_password = data.get('currentPassword')?.toString() || '';
	const new_password = data.get('newPassword')?.toString() || '';
	const confirm_password = data.get('confirmPassword')?.toString() || '';

	if (!current_password || !new_password || !confirm_password) {
		return { error: 'All password fields are required' };
	}
	if (new_password !== confirm_password) {
		return { error: "Your passwords don't match" };
	}
	if (current_password === new_password) {
		return { error: 'Cannot change into the same password' };
	}
	return { current_password, new_password };
}

function handle_password_error(e: unknown) {
	const message = e instanceof Error ? e.message : 'Failed to change password';
	console.error('Error changing password:', e);
	if (message.toLowerCase().includes('current password') || message.toLowerCase().includes('incorrect')) {
		return fail(400, { message: 'Wrong Password' });
	}
	return fail(500, { message });
}
