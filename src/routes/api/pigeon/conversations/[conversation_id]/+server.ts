import { json, type RequestHandler } from '@sveltejs/kit';
import { get_conversation_meta, get_thread } from '$lib/server/pigeon-post';
import { require_user, to_error_response } from '$lib/server/pigeon-api';

/** One conversation: its participants, whether sending is allowed, and the visible thread. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, params, url }) => {
	try {
		const user = await require_user(request);
		const conversation_id = params.conversation_id as string;

		const raw_limit = Number(url.searchParams.get('limit'));
		const limit = Number.isFinite(raw_limit) && raw_limit > 0 ? raw_limit : 50;

		const [conversation, thread] = await Promise.all([
			get_conversation_meta(conversation_id, user.id),
			get_thread(conversation_id, user.id, { limit })
		]);

		return json({ conversation, ...thread });
	} catch (error) {
		return to_error_response(error, 'Failed to read conversation');
	}
};
