import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { send_verification_code } from '../../../lib/server/email';

// GET: Check if email is verified
// eslint-disable-next-line @typescript-eslint/naming-convention
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
// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const email = locals.user.email;
	const code = Math.floor(100000 + Math.random() * 900000).toString();
	const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

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
			args: [crypto.randomUUID(), email, code, expires_at, now, now]
		});

		// Send email
		await send_verification_code(email, code);

		return json({ success: true, message: 'Verification code sent' });
	} catch (err: unknown) {
		console.error('[Verification API] Error sending code:', err);
		return json({ error: 'Failed to send verification code' }, { status: 500 });
	}
};

// PATCH: Verify code
// eslint-disable-next-line @typescript-eslint/naming-convention
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
		const expires_at = new Date(row.expiresAt as string);
		if (expires_at < new Date()) {
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
	} catch (err: unknown) {
		console.error('[Verification API] Error verifying code:', err);
		return json({ error: 'Failed to verify email' }, { status: 500 });
	}
};

// PUT: Change email
// eslint-disable-next-line @typescript-eslint/naming-convention
export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { email: new_email } = await request.json();
	if (!new_email || !new_email.includes('@')) {
		return json({ error: 'Invalid email address' }, { status: 400 });
	}

	try {
		// Check if email already exists
		const existing = await db.execute({
			sql: 'SELECT id FROM user WHERE email = ? AND id != ? LIMIT 1',
			args: [new_email, locals.user.id]
		});

		if (existing.rows.length > 0) {
			return json({ error: 'Email address already in use' }, { status: 400 });
		}

		// Update user email and reset verification status
		await db.execute({
			sql: 'UPDATE user SET email = ?, emailVerified = 0 WHERE id = ?',
			args: [new_email, locals.user.id]
		});

		// Trigger new verification code for the new email
		const code = Math.floor(100000 + Math.random() * 900000).toString();
		const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

		await db.execute({
			sql: 'DELETE FROM verification WHERE identifier = ?',
			args: [new_email]
		});

		const now = new Date().toISOString();
		await db.execute({
			sql: 'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
			args: [crypto.randomUUID(), new_email, code, expires_at, now, now]
		});

		await send_verification_code(new_email, code);

		return json({ success: true, message: 'Email updated and verification code sent' });
	} catch (err: unknown) {
		console.error('[Verification API] Error changing email:', err);
		return json({ error: 'Failed to update email' }, { status: 500 });
	}
};
