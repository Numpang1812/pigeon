import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { send_verification_code } from '../../../lib/server/email';

console.log('[Verification API] send_verification_code:', typeof send_verification_code);

// GET: Check if email is verified
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const result = await db.execute({
		sql: 'SELECT emailVerified, email FROM user WHERE id = ? LIMIT 1',
		args: [locals.user.id]
	});

	const row = result.rows[0];
	return json({
		verified: Boolean(row?.emailVerified),
		email: row?.email
	});
};

// POST: Send verification code
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const email = locals.user.email;
	const code = Math.floor(100000 + Math.random() * 900000).toString();
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

	try {
		// Delete any existing verification codes for this identifier
		await db.execute({
			sql: 'DELETE FROM verification WHERE identifier = ?',
			args: [email]
		});

		// Store new code
		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
			args: [crypto.randomUUID(), email, code, expiresAt, now, now]
		});

		// Send email
		await send_verification_code(email, code);

		return json({ success: true, message: 'Verification code sent' });
	} catch (err: any) {
		console.error('[Verification API] Error sending code:', err);
		return json({ error: 'Failed to send verification code' }, { status: 500 });
	}
};

// PATCH: Verify code
export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { code } = await request.json();
	if (!code || code.length !== 6) {
		return json({ error: 'Invalid code format' }, { status: 400 });
	}

	const email = locals.user.email;

	try {
		// Find code in database
		const result = await db.execute({
			sql: 'SELECT value, expiresAt FROM verification WHERE identifier = ? AND value = ? LIMIT 1',
			args: [email, code]
		});

		const row = result.rows[0];
		if (!row) {
			return json({ error: 'Invalid verification code' }, { status: 400 });
		}

		// Check expiry
		const expiresAt = new Date(row.expiresAt as string);
		if (expiresAt < new Date()) {
			return json({ error: 'Verification code has expired' }, { status: 400 });
		}

		// Update user
		await db.execute({
			sql: 'UPDATE user SET emailVerified = 1 WHERE id = ?',
			args: [locals.user.id]
		});

		// Clean up
		await db.execute({
			sql: 'DELETE FROM verification WHERE identifier = ?',
			args: [email]
		});

		return json({ success: true, message: 'Email verified successfully' });
	} catch (err: any) {
		console.error('[Verification API] Error verifying code:', err);
		return json({ error: 'Failed to verify email' }, { status: 500 });
	}
};

// PUT: Change email
export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { email: newEmail } = await request.json();
	if (!newEmail || !newEmail.includes('@')) {
		return json({ error: 'Invalid email address' }, { status: 400 });
	}

	try {
		// Check if email already exists
		const existing = await db.execute({
			sql: 'SELECT id FROM user WHERE email = ? AND id != ? LIMIT 1',
			args: [newEmail, locals.user.id]
		});

		if (existing.rows.length > 0) {
			return json({ error: 'Email address already in use' }, { status: 400 });
		}

		// Update user email and reset verification status
		await db.execute({
			sql: 'UPDATE user SET email = ?, emailVerified = 0 WHERE id = ?',
			args: [newEmail, locals.user.id]
		});

		// Trigger new verification code for the new email
		const code = Math.floor(100000 + Math.random() * 900000).toString();
		const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

		await db.execute({
			sql: 'DELETE FROM verification WHERE identifier = ?',
			args: [newEmail]
		});

		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
			args: [crypto.randomUUID(), newEmail, code, expiresAt, now, now]
		});

		await send_verification_code(newEmail, code);

		return json({ success: true, message: 'Email updated and verification code sent' });
	} catch (err: any) {
		console.error('[Verification API] Error changing email:', err);
		return json({ error: 'Failed to update email' }, { status: 500 });
	}
};
