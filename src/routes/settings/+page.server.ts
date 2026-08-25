import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import {
	delete_from_cloudinary,
	extract_public_id
} from '$lib/server/cloudinary';
import {
	default_notification_prefs,
	get_notification_prefs,
	set_notification_prefs,
	type NotificationPrefKey
} from '$lib/server/profile-helpers';

const pref_keys: NotificationPrefKey[] = ['follow', 'like', 'dislike', 'repost', 'pigeon'];

/**
 * Loads the signed-in user's home loft.
 *
 * These coordinates are exact rather than fuzzed: a user's own position is not
 * a secret from them. Everyone else only ever sees a distance, or a position
 * snapped to a ~1km grid.
 *
 * Updating the loft goes through POST /api/pigeon/home, the same endpoint the
 * signup gate uses, so the write and its cache invalidation live in one place.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.id) {
		return { home: null, prefs: default_notification_prefs() };
	}

	const [home_result, prefs] = await Promise.all([
		db.execute({
			sql: 'SELECT home_lat, home_lng, home_accuracy_m, home_set_at FROM user WHERE id = ? LIMIT 1',
			args: [locals.user.id]
		}),
		get_notification_prefs(locals.user.id)
	]);

	const row = home_result.rows[0];
	if (!row || row.home_lat === null || row.home_lng === null) {
		return { home: null, prefs };
	}

	return {
		home: {
			lat: Number(row.home_lat),
			lng: Number(row.home_lng),
			accuracy_m: row.home_accuracy_m === null ? null : Number(row.home_accuracy_m),
			set_at: (row.home_set_at as string | null) ?? null
		},
		prefs
	};
};

export const actions: Actions = {
	notification_prefs: async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) return fail(401, { message: 'Unauthorized' });

		const data = await request.formData();
		const patch: Partial<Record<NotificationPrefKey, boolean>> = {};
		for (const key of pref_keys) {
			patch[key] = data.get(key) === 'on';
		}

		const prefs = await set_notification_prefs(session.user.id, patch);
		return { success: true, message: 'Notification settings saved', prefs };
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

			// CASCADE removes posts, comments, likes, etc.
			await db.execute({
				sql: 'DELETE FROM user WHERE id = ?',
				args: [session.user.id]
			});

			// User is already deleted; this cleans up any remaining sessions.
			await auth.api
				.revokeSession({ body: { token: '' }, headers: request.headers })
				.catch(() => {});

			return { deleted: true };
		} catch (e: unknown) {
			if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: number }).status === 'number') {
				throw e;
			}
			console.error('Error deleting account:', e);
			return fail(500, { message: 'Failed to delete account' });
		}
	}
};

async function delete_user_media(user_id: string) {
	const user_data = await db.execute({
		sql: 'SELECT id, image, cover FROM user WHERE id = ?',
		args: [user_id]
	});

	const post_media_result = await db.execute({
		sql: `
			SELECT pm.s3_key, pm.media_url
			FROM post_media pm
			JOIN post p ON pm.post_id = p.id
			WHERE p.author_id = ?
		`,
		args: [user_id]
	});

	const cloudinary_promises: Promise<void>[] = [];

	const avatar_url = user_data.rows[0]?.image as string | null;
	const is_default_avatar =
		avatar_url?.includes('ui-avatars.com') || avatar_url?.startsWith('/');
	if (avatar_url && !is_default_avatar) {
		const avatar_id = extract_public_id(avatar_url);
		if (avatar_id) cloudinary_promises.push(delete_from_cloudinary(avatar_id));
	}

	const cover_url = user_data.rows[0]?.cover as string | null;
	if (cover_url) {
		const cover_id = extract_public_id(cover_url);
		if (cover_id) cloudinary_promises.push(delete_from_cloudinary(cover_id));
	}

	for (const row of post_media_result.rows) {
		const media_url = row.media_url as string;
		const media_id = extract_public_id(media_url);
		if (media_id) cloudinary_promises.push(delete_from_cloudinary(media_id));
	}

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
	if (message.toLowerCase().includes('current password') || message.toLowerCase().includes('incorrect')) {
		return fail(400, { message: 'Wrong Password' });
	}
	return fail(500, { message });
}
