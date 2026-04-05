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

		try {
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
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return fail(401, { message: 'Unauthorized' });
		}

		const data = await request.formData();
		const current_password = data.get('currentPassword')?.toString() || '';
		const new_password = data.get('newPassword')?.toString() || '';
		const confirm_password = data.get('confirmPassword')?.toString() || '';

		if (!current_password || !new_password || !confirm_password) {
			return fail(400, { message: 'All password fields are required' });
		}

		if (new_password !== confirm_password) {
			return fail(400, { message: "Your passwords don't match" });
		}

		if (current_password === new_password) {
			return fail(400, { message: 'Cannot change into the same password' });
		}

		try {
			await auth.api.changePassword({
				body: {
					newPassword: new_password,
					currentPassword: current_password
				},
				headers: request.headers
			});
			return { success: true, message: 'Password updated successfully' };
		} catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Failed to change password';
			console.error('Error changing password:', e);
			// Provide a clearer message for wrong current password
			if (message.toLowerCase().includes('current password') || message.toLowerCase().includes('incorrect')) {
				return fail(400, { message: 'Wrong Password' });
			}
			return fail(500, { message });
		}
	}
};
