import { betterAuth } from 'better-auth';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { env } from '$env/dynamic/private';
import { get_auth_db_dialect } from './server/auth-db';
import { get_client } from './server/db';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour

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
		useSecureCookies: env.NODE_ENV === 'production',
		defaultCookieAttributes: {
			sameSite: 'lax',
			httpOnly: true,
			secure: env.NODE_ENV === 'production'
		}
	},
	rateLimit: {
		enabled: false // Disable built-in rate limiting; we use custom account lockout
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (!ctx.path.startsWith('/sign-in/email')) return;

			const email = ctx.body?.email;
			if (!email) return;

			if (import.meta.env.DEV) {
				console.log(`[Auth Hook] BEFORE signIn: checking lockout for ${email}`);
			}

			try {
				const user_info = await get_user_lockout_info(email);

				if (!user_info) {
					if (import.meta.env.DEV) {
						console.log(`[Auth Hook] BEFORE: User not found: ${email}`);
					}
					return;
				}

				if (user_info.lockout_until && user_info.lockout_until !== '') {
					const lockout_time = new Date(user_info.lockout_until).getTime();
					const now = Date.now();

					if (lockout_time > now) {
						if (import.meta.env.DEV) {
							const remaining_minutes = Math.ceil((lockout_time - now) / 60000);
							console.log(
								`[Auth Hook] BEFORE: 🚫 Account LOCKED for ${email} (${remaining_minutes}min remaining)`
							);
						}

						// Send the actual lockout timestamp so client can compute remaining time
						throw new APIError('FORBIDDEN', {
							message: `LOCKOUT|${user_info.lockout_until}`
						});
					}
				}

				if (import.meta.env.DEV) {
					console.log(
						`[Auth Hook] BEFORE: ✅ Not locked (attempts: ${user_info.failed_login_attempts})`
					);
				}
			} catch (err) {
				if (err instanceof APIError) throw err;
				console.error('[Auth Hook] BEFORE error:', err);
			}
		}),
		after: createAuthMiddleware(async (ctx) => {
			if (!ctx.path.startsWith('/sign-in/email')) return;

			const email = ctx.body?.email;
			if (!email) return;

			try {
				// Check if sign-in succeeded by looking for newSession
				const new_session = ctx.context.newSession;

				const user_info = await get_user_lockout_info(email);

				if (!user_info) return;

				if (!new_session) {
					// Don't increment if already locked and not expired
					const is_locked = user_info.lockout_until && user_info.lockout_until !== '' && new Date(user_info.lockout_until).getTime() > Date.now();
					if (is_locked) {
						if (import.meta.env.DEV) {
							console.log(
								`[Auth Hook] AFTER: ⏸️ Already locked, skipping increment for ${email}`
							);
						}
						return;
					}

					// FAILED login - increment counter
					const new_attempts = user_info.failed_login_attempts + 1;
					await increment_failed_attempts(user_info.user_id, new_attempts);

					// Lock if max attempts reached
					if (new_attempts >= MAX_FAILED_ATTEMPTS) {
						const lockout_until = new Date(
							Date.now() + LOCKOUT_DURATION_MS
						).toISOString();
						await lock_account(user_info.user_id, lockout_until);

						if (import.meta.env.DEV) {
							console.log(
								`[Auth Hook] AFTER: 🔒 Account LOCKED for ${email} after ${new_attempts} failed attempts`
							);
						}
					} else {
						if (import.meta.env.DEV) {
							console.log(
								`[Auth Hook] AFTER: ❌ Failed login #${new_attempts} for ${email}`
							);
						}
					}
				} else {
					// SUCCESSFUL login - reset counter
					if (user_info.failed_login_attempts > 0) {
						await reset_lockout(user_info.user_id);
						if (import.meta.env.DEV) {
							console.log(
								`[Auth Hook] AFTER: ✅ Successful login for ${email}, reset counter from ${user_info.failed_login_attempts}`
							);
						}
					}
				}
			} catch (err) {
				console.error('[Auth Hook] AFTER error:', err);
			}
		})
	}
});

if (import.meta.env.DEV) {
	console.info('[Auth] BetterAuth initialized successfully');
}
