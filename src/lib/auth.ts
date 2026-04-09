import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import { get_auth_db_dialect } from './server/auth-db';
import { get_client } from './server/db';

const max_failed_attempts = 5;
const lockout_duration_ms = 60 * 60 * 1000; // 1 hour

if (import.meta.env.DEV) {
	console.info('[Auth] Initializing BetterAuth...');
	console.info('[Auth] GOOGLE_CLIENT_ID:', env.GOOGLE_CLIENT_ID ? 'set' : 'undefined');
	console.info('[Auth] GITHUB_CLIENT_ID:', env.GITHUB_CLIENT_ID ? 'set' : 'undefined');
}

// Only configure OAuth providers if credentials are provided
const google_enabled =
	env.GOOGLE_CLIENT_ID &&
	env.GOOGLE_CLIENT_SECRET &&
	env.GOOGLE_CLIENT_ID !== '' &&
	env.GOOGLE_CLIENT_SECRET !== '';

const github_enabled =
	env.GITHUB_CLIENT_ID &&
	env.GITHUB_CLIENT_SECRET &&
	env.GITHUB_CLIENT_ID !== '' &&
	env.GITHUB_CLIENT_SECRET !== '';

if (import.meta.env.DEV) {
	console.info('[Auth] Google enabled:', google_enabled);
	console.info('[Auth] GitHub enabled:', github_enabled);
}

async function get_user_lockout_info(email: string) {
	const db = get_client();
	const result = await db.execute({
		sql: `SELECT id, failed_login_attempts, lockout_until FROM user WHERE LOWER(email) = LOWER(?)`,
		args: [email]
	});

	if (result.rows.length === 0) return null;

	const row = result.rows[0];
	return {
		user_id: String(row.id),
		failed_login_attempts: Number(row.failed_login_attempts) || 0,
		lockout_until: String(row.lockout_until) || null
	};
}

async function increment_failed_attempts(user_id: string, attempts: number) {
	const db = get_client();
	await db.execute({
		sql: `UPDATE user SET failed_login_attempts = ? WHERE id = ?`,
		args: [attempts, user_id]
	});
}

async function lock_account(user_id: string, lockout_until: string) {
	const db = get_client();
	await db.execute({
		sql: `UPDATE user SET lockout_until = ? WHERE id = ?`,
		args: [lockout_until, user_id]
	});
}

async function reset_lockout(user_id: string) {
	const db = get_client();
	await db.execute({
		sql: `UPDATE user SET failed_login_attempts = 0, lockout_until = NULL WHERE id = ?`,
		args: [user_id]
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle_before_signin(ctx: {
	path: string;
	body?: any;
	context: any;
	[key: string]: any;
}) {
	if (!ctx.path.startsWith('/sign-in/email')) return;

	const email = ctx.body?.email;
	if (!email) return;

	if (import.meta.env.DEV) {
		console.info(`[Auth Hook] BEFORE signIn: checking lockout for ${email}`);
	}

	try {
		const user_info = await get_user_lockout_info(email);
		if (!user_info) {
			if (import.meta.env.DEV) {
				console.info(`[Auth Hook] BEFORE: User not found: ${email}`);
			}
			return;
		}

		if (user_info.lockout_until && user_info.lockout_until !== '') {
			const lockout_time = new Date(user_info.lockout_until).getTime();
			const now = Date.now();
			check_lockout_time(lockout_time, now, email, user_info.lockout_until);
		}

		if (import.meta.env.DEV) {
			console.info(
				`[Auth Hook] BEFORE: ✅ Not locked (attempts: ${user_info.failed_login_attempts})`
			);
		}
	} catch (err) {
		if (err instanceof APIError) throw err;
		console.error('[Auth Hook] BEFORE error:', err);
	}
}

function check_lockout_time(
	lockout_time: number,
	now: number,
	email: string,
	lockout_until: string
) {
	if (lockout_time > now) {
		if (import.meta.env.DEV) {
			const remaining_minutes = Math.ceil((lockout_time - now) / 60000);
			console.info(
				`[Auth Hook] BEFORE: 🚫 Account LOCKED for ${email} (${remaining_minutes}min remaining)`
			);
		}
		throw new APIError('FORBIDDEN', {
			message: `LOCKOUT|${lockout_until}`
		});
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handle_after_signin(ctx: {
	path: string;
	body?: any;
	context: any;
	[key: string]: any;
}) {
	if (!ctx.path.startsWith('/sign-in/email')) return;

	const email = ctx.body?.email;
	if (!email) return;

	try {
		const new_session = ctx.context.newSession;
		const user_info = await get_user_lockout_info(email);
		if (!user_info) return;

		if (new_session) {
			if (user_info.failed_login_attempts > 0) {
				await reset_lockout(user_info.user_id);
				log_after_action('SUCCESS', email, user_info.failed_login_attempts);
			}
			return;
		}

		const is_locked = handle_is_locked(user_info, email);
		if (is_locked) return;

		const new_attempts = user_info.failed_login_attempts + 1;
		await increment_failed_attempts(user_info.user_id, new_attempts);

		if (new_attempts >= max_failed_attempts) {
			const lockout_until = new Date(Date.now() + lockout_duration_ms).toISOString();
			await lock_account(user_info.user_id, lockout_until);
			log_after_action('LOCKED', email, new_attempts);
		} else {
			log_after_action('FAILED', email, new_attempts);
		}
	} catch (err) {
		console.error('[Auth Hook] AFTER error:', err);
	}
}

type UserLockoutInfo = NonNullable<Awaited<ReturnType<typeof get_user_lockout_info>>>;

function handle_is_locked(user_info: UserLockoutInfo, email: string): boolean {
	const is_locked =
		user_info.lockout_until &&
		user_info.lockout_until !== '' &&
		new Date(user_info.lockout_until).getTime() > Date.now();
	if (is_locked) {
		log_after_action('ALREADY_LOCKED', email);
		return true;
	}
	return false;
}

function log_after_action(
	action: 'SUCCESS' | 'LOCKED' | 'FAILED' | 'ALREADY_LOCKED',
	email: string,
	attempts?: number
) {
	if (!import.meta.env.DEV) return;
	switch (action) {
		case 'SUCCESS':
			console.info(
				`[Auth Hook] AFTER: ✅ Successful login for ${email}, reset counter from ${attempts}`
			);
			break;
		case 'LOCKED':
			console.info(
				`[Auth Hook] AFTER: 🔒 Account LOCKED for ${email} after ${attempts} failed attempts`
			);
			break;
		case 'FAILED':
			console.info(`[Auth Hook] AFTER: ❌ Failed login #${attempts} for ${email}`);
			break;
		case 'ALREADY_LOCKED':
			console.info(`[Auth Hook] AFTER: ⏸️ Already locked, skipping increment for ${email}`);
			break;
	}
}

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: {
		dialect: get_auth_db_dialect(),
		type: 'sqlite'
	},
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false
	},
	socialProviders: {
		google: google_enabled
			? {
					clientId: env.GOOGLE_CLIENT_ID!,
					clientSecret: env.GOOGLE_CLIENT_SECRET!
				}
			: undefined,
		github: github_enabled
			? {
					clientId: env.GITHUB_CLIENT_ID!,
					clientSecret: env.GITHUB_CLIENT_SECRET!
				}
			: undefined
	},
	session: {
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5
		},
		expiresIn: 60 * 60 * 24 * 7 // 7 days
	},
	advanced: {
		useSecureCookies: env.NODE_ENV === 'production'
	},
	rateLimit: {
		enabled: false // Disable built-in rate limiting; we use custom account lockout
	},
	hooks: {
		before: createAuthMiddleware(handle_before_signin),
		after: createAuthMiddleware(handle_after_signin)
	}
});

if (import.meta.env.DEV) {
	console.info('[Auth] BetterAuth initialized successfully');
}
