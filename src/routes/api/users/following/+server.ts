import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { get_profile_following } from '$lib/server/profile-helpers';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '100'), 1), 250);
		const users = await get_profile_following(session.user.id, limit);

		return json({
			users: users.map((user) => ({
				id: user.id,
				name: user.name,
				handle: user.handle,
				avatar: user.avatar
			}))
		});
	} catch (error) {
		console.error('[USER FOLLOWING API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};