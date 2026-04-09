import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import {
	get_profile_user_by_handle,
	toggle_follow_relationship,
	create_follow_notification,
	get_follow_counts
} from '$lib/server/profile-helpers';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const handle = params.handle?.trim();
		if (!handle) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const target_user = await get_profile_user_by_handle(handle);
		if (!target_user) {
			return json({ error: 'User not found' }, { status: 404 });
		}

		const target_user_id = target_user.id as string;
		if (target_user_id === session.user.id) {
			return json({ error: 'You cannot follow yourself' }, { status: 400 });
		}

		const result = await toggle_follow_relationship(session.user.id, target_user_id);
		if (result.is_following) {
			await create_follow_notification(target_user_id, session.user.id);
		}

		const counts = await get_follow_counts(target_user_id);

		return json({
			success: true,
			is_following: result.is_following,
			followers_count: counts.followers
		});
	} catch (error) {
		console.error('[FOLLOW API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
