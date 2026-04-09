/**
 * Cloudinary Storage Client
 *
 * Handles uploading profile pictures and post media to Cloudinary.
 * Free tier: 25 credits/month, no credit card required.
 */

import { v2 as cloudinary } from 'cloudinary';
import { env } from '$env/dynamic/private';

// ==========================================
// Cloudinary Initialization
// ==========================================

let configured = false;

function ensure_configured() {
	if (!configured) {
		cloudinary.config({
			cloud_name: env.CLOUDINARY_CLOUD_NAME,
			api_key: env.CLOUDINARY_API_KEY,
			api_secret: env.CLOUDINARY_API_SECRET
		});
		configured = true;
		if (process.env.NODE_ENV !== 'production') {
			console.info('[Cloudinary] Configured for cloud:', env.CLOUDINARY_CLOUD_NAME);
		}
	}
}

// ==========================================
// Upload Functions
// ==========================================

/**
 * Upload a buffer to Cloudinary
 *
 * @param buffer - The file content as Buffer or Uint8Array
 * @param folder - The folder path in Cloudinary
 * @param public_id - Optional custom public ID
 * @returns The public URL of the uploaded file
 */
async function upload_buffer(
	buffer: Buffer | Uint8Array,
	folder: string,
	public_id?: string
): Promise<{ url: string; public_id: string }> {
	ensure_configured();

	return new Promise((resolve, reject) => {
		const upload_stream = cloudinary.uploader.upload_stream(
			{
				folder,
				public_id,
				resource_type: 'image',
				overwrite: true,
				transformation: [
					{ quality: 'auto', fetch_format: 'auto' }
				]
			},
			(error, result) => {
				if (error) {
					reject(error);
				} else if (result) {
					resolve({
						url: result.secure_url,
						public_id: result.public_id
					});
				} else {
					reject(new Error('No result from Cloudinary'));
				}
			}
		);
		upload_stream.end(Buffer.from(buffer));
	});
}

/**
 * Upload a profile picture
 *
 * @param user_id - The user's ID
 * @param file_buffer - Image buffer
 * @param _mime_type - Image MIME type (Cloudinary auto-detects)
 * @returns The public URL of the uploaded profile picture
 */
export async function upload_profile_picture(
	user_id: string,
	file_buffer: Buffer
): Promise<string> {
	const result = await upload_buffer(
		file_buffer,
		'pigeon/avatars',
		`avatar_${user_id}`
	);

	if (process.env.NODE_ENV !== 'production') {
		console.info('[Cloudinary] Uploaded avatar:', result.url);
	}
	return result.url;
}

/**
 * Upload a cover photo
 *
 * @param user_id - The user's ID
 * @param file_buffer - Image buffer
 * @returns The public URL of the uploaded cover photo
 */
export async function upload_cover_photo(
	user_id: string,
	file_buffer: Buffer
): Promise<string> {
	const result = await upload_buffer(
		file_buffer,
		'pigeon/covers',
		`cover_${user_id}`
	);

	if (process.env.NODE_ENV !== 'production') {
		console.info('[Cloudinary] Uploaded cover:', result.url);
	}
	return result.url;
}

/**
 * Upload a post media file
 *
 * @param user_id - The user's ID
 * @param file_buffer - File buffer
 * @param _mime_type - File MIME type (Cloudinary auto-detects)
 * @returns Object containing public URL and Cloudinary public_id
 */
export async function upload_post_media(
	user_id: string,
	file_buffer: Buffer
): Promise<{ url: string; key: string }> {
	const timestamp = Date.now();
	const result = await upload_buffer(
		file_buffer,
		`pigeon/posts/${user_id}`,
		`post_${timestamp}`
	);

	return { url: result.url, key: result.public_id };
}

/**
 * Delete a file from Cloudinary
 *
 * @param public_id - The Cloudinary public_id of the file
 */
export async function delete_from_cloudinary(public_id: string): Promise<void> {
	ensure_configured();
	await cloudinary.uploader.destroy(public_id);
}

/**
 * Extract Cloudinary public_id from a URL
 *
 * @param url - The Cloudinary URL
 * @returns The public_id or null
 */
export function extract_public_id(url: string): string | null {
	try {
		// Cloudinary URLs: https://res.cloudinary.com/{cloud}/image/upload/v{version}/{public_id}.{ext}
		const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}
