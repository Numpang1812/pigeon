/**
 * API Route: Upload Avatar
 *
 * Accepts a compressed image file, uploads to Cloudinary,
 * and updates the user's profile picture URL in the database.
 *
 * POST /api/upload-avatar
 * Content-Type: multipart/form-data
 * Body: { file: File }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { auth } from '$lib/auth';
import { upload_profile_picture } from '$lib/server/cloudinary';
import { db } from '$lib/server/db';
import { profile_image_limiter } from '$lib/server/rate-limiter';

// ==========================================
// Constants
// ==========================================

const max_file_size = 10 * 1024 * 1024; // 10MB (before compression)
const allowed_mime_types = ['image/jpeg', 'image/png', 'image/webp'];

// ==========================================
// Helpers
// ==========================================

function validate_file(file: File) {
	if (file.size > max_file_size) {
		throw error(400, `File size exceeds maximum allowed size of ${max_file_size / 1024 / 1024}MB`);
	}
	if (!allowed_mime_types.includes(file.type)) {
		throw error(400, `Invalid file type. Allowed types: ${allowed_mime_types.join(', ')}`);
	}
}

// ==========================================
// Request Handler
// ==========================================

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		// 1. Check authentication
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session?.user) {
			throw error(401, 'Unauthorized: You must be logged in');
		}

		const user_id = session.user.id;

		// Rate limit: 5 profile image changes per 24 hours (shared with cover)
		const rate_limit = profile_image_limiter.check(user_id, 5, 24 * 60 * 60 * 1000);
		if (!rate_limit.allowed) {
			throw error(429, 'Too many changes per day. Please try again later.');
		}

		// 2. Parse multipart form data
		const form_data = await request.formData();
		const file = form_data.get('file') as File | null;

		if (!file) {
			throw error(400, 'No file provided');
		}

		// 3. Validate file
		validate_file(file);

		// 4. Convert File to Buffer and upload to Cloudinary
		const array_buffer = await file.arrayBuffer();
		const file_buffer = Buffer.from(array_buffer);
		const new_avatar_url = await upload_profile_picture(user_id, file_buffer);

		// 5. Update user's image in database
		// Note: No need to delete old avatar - Cloudinary's overwrite: true
		// automatically replaces the old image with the new one at the same public_id
		await db.execute({
			sql: 'UPDATE user SET image = ?, updatedAt = datetime(\'now\') WHERE id = ?',
			args: [new_avatar_url, user_id]
		});

		// 6. Return success with new URL
		return json({
			success: true,
			message: 'Avatar uploaded successfully',
			imageUrl: new_avatar_url
		});
	} catch (err: unknown) {
		// If it's already a SvelteKit error, rethrow it
		if (err && typeof err === 'object' && 'status' in err && 'body' in err) {
			throw err;
		}

		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('Avatar upload error:', err);
		throw error(500, `Failed to upload avatar: ${message}`);
	}
};
