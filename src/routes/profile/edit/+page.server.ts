import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { normalize_handle } from '$lib';
import { delete_from_cloudinary, extract_public_id } from '$lib/server/cloudinary';

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
	},
	delete: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return fail(401, { message: 'Unauthorized' });

		const data = await request.formData();
		const confirmation = data.get('deleteConfirmation')?.toString() || '';

		if (confirmation !== 'IWANTTODELETEMYACCOUNT') {
			return fail(400, { message: 'Confirmation text does not match' });
		}

		try {
			await delete_user_media(session.user.id);

			// 5. Delete user from database (CASCADE handles posts, comments, likes, etc.)
			await db.execute({
				sql: 'DELETE FROM user WHERE id = ?',
				args: [session.user.id]
			});

			// 6. Revoke all sessions from BetterAuth (server-side API call)
			// Note: User is already deleted, this cleans up any remaining sessions
			await auth.api
				.revokeSession({
					body: { token: '' },
					headers: request.headers
				})
				.catch(() => {}); // Ignore errors since user is already deleted

			return { deleted: true };
		} catch (e: unknown) {
			if (
				e &&
				typeof e === 'object' &&
				'status' in e &&
				typeof (e as { status: number }).status === 'number'
			) {
				throw e;
			}
			console.error('Error deleting account:', e);
			return fail(500, { message: 'Failed to delete account' });
		}
	}
};

async function delete_user_media(user_id: string) {
	// 1. Fetch user profile data (avatar, cover) before deletion
	const user_data = await db.execute({
		sql: 'SELECT id, image, cover FROM user WHERE id = ?',
		args: [user_id]
	});

	// 2. Fetch all post media Cloudinary keys for user's posts
	const post_media_result = await db.execute({
		sql: `
			SELECT pm.s3_key, pm.media_url
			FROM post_media pm
			JOIN post p ON pm.post_id = p.id
			WHERE p.author_id = ?
		`,
		args: [user_id]
	});

	// 3. Delete Cloudinary assets for user's profile images
	const cloudinary_promises: Promise<void>[] = [];

	const avatar_url = user_data.rows[0]?.image as string | null;
	if (avatar_url && !avatar_url.includes('ui-avatars.com')) {
		const avatar_id = extract_public_id(avatar_url);
		if (avatar_id) cloudinary_promises.push(delete_from_cloudinary(avatar_id));
	}

	const cover_url = user_data.rows[0]?.cover as string | null;
	if (cover_url) {
		const cover_id = extract_public_id(cover_url);
		if (cover_id) cloudinary_promises.push(delete_from_cloudinary(cover_id));
	}

	// 4. Delete Cloudinary assets for all user's post media
	for (const row of post_media_result.rows) {
		const media_url = row.media_url as string;
		const media_id = extract_public_id(media_url);
		if (media_id) cloudinary_promises.push(delete_from_cloudinary(media_id));
	}

	// Wait for all Cloudinary deletions to complete
	await Promise.allSettled(cloudinary_promises);
}

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
	if (
		message.toLowerCase().includes('current password') ||
		message.toLowerCase().includes('incorrect')
	) {
		return fail(400, { message: 'Wrong Password' });
	}
	return fail(500, { message });
}
