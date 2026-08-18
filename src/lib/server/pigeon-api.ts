/**
 * Shared plumbing for the /api/pigeon/* routes.
 *
 * Every pigeon endpoint needs the same three things: a session or a 401, a way
 * to turn a PigeonError into its JSON response, and a catch-all 500 that logs.
 * Keeping it here means the routes read as their actual logic.
 */

import { json } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { PigeonError } from './pigeon-post';

export type SessionUser = {
	id: string;
};

/** Returns the signed-in user, or throws a PigeonError the caller converts to 401. */
export async function require_user(request: Request): Promise<SessionUser> {
	const session = await auth.api.getSession({ headers: request.headers });

	if (!session) throw new PigeonError(401, 'Unauthorized');

	return { id: session.user.id };
}

/**
 * Turns whatever went wrong into a response.
 *
 * Domain failures carry their own status and body; anything else is unexpected,
 * so it is logged and reported as a 500 without leaking internals.
 */
export function to_error_response(error: unknown, context: string): Response {
	if (error instanceof PigeonError) {
		return json(error.body, { status: error.status });
	}

	console.error(`[PIGEON API] ${context}:`, error);
	return json({ error: 'Internal server error' }, { status: 500 });
}

export function rate_limited_response(retry_after_ms?: number): Response {
	return json({ error: 'too_many_requests', retry_after_ms }, { status: 429 });
}

/** Reads a JSON body without throwing on malformed input. */
export async function read_json_body(request: Request): Promise<Record<string, unknown>> {
	const payload = await request.json().catch(() => null);

	if (!payload || typeof payload !== 'object') return {};

	return payload as Record<string, unknown>;
}

/** Normalises a client-supplied list of user ids. */
export function read_user_id_list(value: unknown, cap = 50): string[] {
	if (!Array.isArray(value)) return [];

	return Array.from(
		new Set(
			value
				.filter((entry): entry is string => typeof entry === 'string')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0)
		)
	).slice(0, cap);
}
