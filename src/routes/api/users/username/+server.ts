import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { db } from '$lib/server/db';
import { normalize_handle } from '$lib';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = (await request.json()) as { username?: unknown };
		const raw_username = normalize_handle(body.username).toLowerCase();

		if (!/^[a-z0-9_]{2,15}$/.test(raw_username)) {
			return json(
				{ error: 'Username must be 2-15 characters using only letters, numbers, or underscores.' },
				{ status: 400 }
			);
		}

		const existing = await db.execute({
			sql: 'SELECT id FROM user WHERE lower(username) = lower(?) AND id != ? LIMIT 1',
			args: [raw_username, session.user.id]
		});

		if (existing.rows.length > 0) {
			return json({ error: 'Username is already taken.' }, { status: 409 });
		}

		await db.execute({
			sql: 'UPDATE user SET username = ? WHERE id = ?',
			args: [raw_username, session.user.id]
		});

		return json({ success: true, username: raw_username }, { status: 200 });
	} catch (error) {
		console.error('[USERNAME API] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
