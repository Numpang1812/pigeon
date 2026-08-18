import { json, type RequestHandler } from '@sveltejs/kit';
import {
	assert_participant,
	count_unread_conversations,
	mark_conversation_read
} from '$lib/server/pigeon-post';
import { read_json_body, require_user, to_error_response } from '$lib/server/pigeon-api';

/**
 * Mark a conversation read.
 *
 * Returns a fresh unread count so opening a thread clears the navigation badge
 * immediately, without the client having to ask again.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const user = await require_user(request);
		const conversation_id = params.conversation_id as string;

		await assert_participant(conversation_id, user.id);

		const body = await read_json_body(request);
		const up_to = typeof body.up_to === 'string' ? body.up_to : null;

		await mark_conversation_read(conversation_id, user.id, up_to);

		return json({
			success: true,
			unread_conversations: await count_unread_conversations(user.id)
		});
	} catch (error) {
		return to_error_response(error, 'Failed to mark conversation read');
	}
};
