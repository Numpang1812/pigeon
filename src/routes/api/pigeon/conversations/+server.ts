import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { normalize_handle } from '$lib/handle';
import {
	count_unread_conversations,
	create_group_conversation,
	create_or_get_direct_conversation,
	get_next_arrival_at,
	list_inbox,
	PigeonError
} from '$lib/server/pigeon-post';
import {
	read_json_body,
	read_user_id_list,
	rate_limited_response,
	require_user,
	to_error_response
} from '$lib/server/pigeon-api';
import { conversation_create_limiter } from '$lib/server/rate-limiter';

/** The inbox, plus the single timestamp the client needs to schedule its next refresh. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const user = await require_user(request);

		const raw_limit = Number(url.searchParams.get('limit'));
		const limit = Number.isFinite(raw_limit) && raw_limit > 0 ? raw_limit : 30;

		const [conversations, unread_conversations, next_arrival_at] = await Promise.all([
			list_inbox(user.id, limit),
			count_unread_conversations(user.id),
			get_next_arrival_at(user.id)
		]);

		return json({
			conversations,
			unread_conversations,
			// For scheduling only. Showing this to a recipient would spoil the arrival.
			next_arrival_at,
			server_now: Date.now()
		});
	} catch (error) {
		return to_error_response(error, 'Failed to list conversations');
	}
};

async function resolve_user_id_from_handle(handle: string): Promise<string> {
	const result = await db.execute({
		sql: 'SELECT id FROM user WHERE lower(username) = lower(?) LIMIT 1',
		args: [normalize_handle(handle)]
	});

	const id = result.rows[0]?.id as string | undefined;
	if (!id) throw new PigeonError(404, 'user_not_found');

	return id;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await require_user(request);

		const rate_limit = conversation_create_limiter.check(user.id, 10, 60_000);
		if (!rate_limit.allowed) return rate_limited_response(rate_limit.retry_after_ms);

		const body = await read_json_body(request);
		const kind = body.kind === 'group' ? 'group' : 'direct';

		if (kind === 'group') {
			const member_ids = read_user_id_list(body.member_ids, 20);
			const title = typeof body.title === 'string' ? body.title : null;
			const created = await create_group_conversation(user.id, member_ids, title);

			return json({ ...created, created: true });
		}

		const other_user_id =
			typeof body.user_id === 'string' && body.user_id.trim().length > 0
				? body.user_id.trim()
				: typeof body.handle === 'string'
					? await resolve_user_id_from_handle(body.handle)
					: null;

		if (!other_user_id) return json({ error: 'user_id_or_handle_required' }, { status: 400 });

		return json(await create_or_get_direct_conversation(user.id, other_user_id));
	} catch (error) {
		return to_error_response(error, 'Failed to create conversation');
	}
};
