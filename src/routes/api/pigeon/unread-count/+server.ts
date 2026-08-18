import { json, type RequestHandler } from '@sveltejs/kit';
import { count_unread_conversations, get_next_arrival_at } from '$lib/server/pigeon-post';
import { require_user, to_error_response } from '$lib/server/pigeon-api';

/**
 * Badge state, plus when to check again.
 *
 * next_arrival_at lets the client set one timer for the exact moment a pigeon
 * lands instead of polling. It must never be rendered.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request }) => {
	try {
		const user = await require_user(request);

		const [unread_conversations, next_arrival_at] = await Promise.all([
			count_unread_conversations(user.id),
			get_next_arrival_at(user.id)
		]);

		return json({ unread_conversations, next_arrival_at, server_now: Date.now() });
	} catch (error) {
		return to_error_response(error, 'Failed to count unread conversations');
	}
};
