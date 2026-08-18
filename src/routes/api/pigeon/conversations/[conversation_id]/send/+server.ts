import { json, type RequestHandler } from '@sveltejs/kit';
import {
	max_attachments_per_message,
	release_pigeon,
	type PendingAttachment
} from '$lib/server/pigeon-post';
import {
	read_json_body,
	rate_limited_response,
	require_user,
	to_error_response
} from '$lib/server/pigeon-api';
import { pigeon_release_limiter } from '$lib/server/rate-limiter';

/** Same normalisation as posts, so a message body behaves the way the rest of the app does. */
function normalize_message_body(raw_body: string): string {
	return raw_body
		.replace(/\r\n?/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

const allowed_media_types = new Set(['image']);

/**
 * Validates a client-supplied attachment.
 *
 * The storage key prefix is the important check: it is what stops a client
 * attaching a URL that belongs to somebody else's upload.
 */
function read_attachments(value: unknown, sender_id: string): PendingAttachment[] {
	if (!Array.isArray(value)) return [];

	return value.slice(0, max_attachments_per_message).map((entry) => {
		const attachment = entry as Record<string, unknown>;
		const url = typeof attachment.url === 'string' ? attachment.url : '';
		const key = typeof attachment.key === 'string' ? attachment.key : '';
		const media_type = typeof attachment.media_type === 'string' ? attachment.media_type : 'image';

		if (!/^https:\/\/res\.cloudinary\.com\//.test(url)) {
			throw new Error('attachment_url_not_allowed');
		}
		if (!key.startsWith(`pigeon/messages/${sender_id}/`)) {
			throw new Error('attachment_not_yours');
		}
		if (!allowed_media_types.has(media_type)) {
			throw new Error('attachment_type_not_allowed');
		}

		return {
			url,
			key,
			media_type,
			file_name: typeof attachment.file_name === 'string' ? attachment.file_name : null,
			byte_size: Number.isFinite(Number(attachment.byte_size))
				? Number(attachment.byte_size)
				: null,
			width: Number.isFinite(Number(attachment.width)) ? Number(attachment.width) : null,
			height: Number.isFinite(Number(attachment.height)) ? Number(attachment.height) : null
		};
	});
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const user = await require_user(request);
		const conversation_id = params.conversation_id as string;

		// Belt and braces. The flock is the real limit: without an available bird
		// there is no send at all.
		const rate_limit = pigeon_release_limiter.check(user.id, 5, 10_000);
		if (!rate_limit.allowed) return rate_limited_response(rate_limit.retry_after_ms);

		const body = await read_json_body(request);
		const message_body = normalize_message_body(typeof body.body === 'string' ? body.body : '');

		let attachments: PendingAttachment[];
		try {
			attachments = read_attachments(body.attachments, user.id);
		} catch (attachment_error) {
			return json({ error: (attachment_error as Error).message }, { status: 400 });
		}

		const result = await release_pigeon(conversation_id, user.id, message_body, attachments);

		return json(
			{
				...result,
				client_temp_id: typeof body.client_temp_id === 'string' ? body.client_temp_id : null
			},
			{ status: 201 }
		);
	} catch (error) {
		return to_error_response(error, 'Failed to release pigeon');
	}
};
