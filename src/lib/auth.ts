import { betterAuth } from 'better-auth';
import { env } from '$env/dynamic/private';
import { get_auth_db_dialect } from './server/auth-db';

console.info('[Auth] Initializing BetterAuth...');
console.info('[Auth] GOOGLE_CLIENT_ID:', env.GOOGLE_CLIENT_ID ? 'set' : 'undefined');
console.info('[Auth] GITHUB_CLIENT_ID:', env.GITHUB_CLIENT_ID ? 'set' : 'undefined');

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

console.info('[Auth] Google enabled:', google_enabled);
console.info('[Auth] GitHub enabled:', github_enabled);

export const auth = betterAuth({
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
		}
	},
	advanced: {
		useSecureCookies: env.NODE_ENV === 'production'
	}
});

console.info('[Auth] BetterAuth initialized successfully');
