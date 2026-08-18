import { json, type RequestHandler } from '@sveltejs/kit';
import { upload_message_attachment } from '$lib/server/cloudinary';
import { rate_limited_response, require_user, to_error_response } from '$lib/server/pigeon-api';
import { pigeon_attachment_limiter } from '$lib/server/rate-limiter';

/**
 * Upload one image for a pigeon to carry.
 *
 * The row in message_attachment is NOT written here — release_pigeon writes it
 * inside its atomic batch, the same separation the posts API uses. An abandoned
 * upload therefore leaves an orphaned Cloudinary asset but never an orphaned
 * database row.
 */

const max_bytes = 8 * 1024 * 1024;
const allowed_mime_types = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		const user = await require_user(request);

		const rate_limit = pigeon_attachment_limiter.check(user.id, 20, 60_000);
		if (!rate_limit.allowed) return rate_limited_response(rate_limit.retry_after_ms);

		const form_data = await request.formData();
		const file = form_data.get('file') as File | null;

		if (!file) return json({ error: 'file_required' }, { status: 400 });

		if (!allowed_mime_types.has(file.type)) {
			return json(
				{ error: 'file_type_not_allowed', allowed: [...allowed_mime_types] },
				{ status: 400 }
			);
		}

		if (file.size > max_bytes) {
			return json({ error: 'file_too_large', max_bytes }, { status: 413 });
		}

		const file_buffer = Buffer.from(await file.arrayBuffer());
		const uploaded = await upload_message_attachment(user.id, file_buffer);

		return json({
			...uploaded,
			media_type: 'image',
			byte_size: file.size,
			file_name: file.name || null
		});
	} catch (error) {
		return to_error_response(error, 'Failed to upload attachment');
	}
};
