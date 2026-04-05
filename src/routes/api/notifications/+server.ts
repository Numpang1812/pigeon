import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { ensure_schema } from '$lib/server/db';
import { fetch_activity_notifications_for_user } from '$lib/server/notifications';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, url }) => {
	try {
		await ensure_schema();

		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const limit = Number.parseInt(url.searchParams.get('limit') ?? '30', 10);
		const offset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);

		const notifications = await fetch_activity_notifications_for_user(session.user.id, {
			limit: Number.isNaN(limit) ? 30 : limit,
			offset: Number.isNaN(offset) ? 0 : offset
		});

		return json({ success: true, notifications }, { status: 200 });
	} catch (error) {
		console.error('[NOTIFICATIONS API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
