import { json, type RequestHandler } from '@sveltejs/kit';
import { add_group_members, leave_conversation } from '$lib/server/pigeon-post';
import {
	read_json_body,
	read_user_id_list,
	require_user,
	to_error_response
} from '$lib/server/pigeon-api';

/** Add members to a group. Owner only, and each addition must be mutual with the owner. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const user = await require_user(request);
		const conversation_id = params.conversation_id as string;

		const body = await read_json_body(request);
		const member_ids = read_user_id_list(body.member_ids, 20);

		if (member_ids.length === 0) {
			return json({ error: 'member_ids_required' }, { status: 400 });
		}

		return json({ added: await add_group_members(conversation_id, user.id, member_ids) });
	} catch (error) {
		return to_error_response(error, 'Failed to add group members');
	}
};

/**
 * Leave a conversation.
 *
 * Anyone may leave anything. This is the escape hatch that makes "sending is
 * blocked but history stays readable" tolerable — you are never stuck in a
 * conversation you no longer want.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DELETE: RequestHandler = async ({ request, params }) => {
	try {
		const user = await require_user(request);

		await leave_conversation(params.conversation_id as string, user.id);

		return json({ success: true });
	} catch (error) {
		return to_error_response(error, 'Failed to leave conversation');
	}
};
