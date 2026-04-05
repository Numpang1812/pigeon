import { building } from '$app/environment';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Initialize database schema on server start
let db_initialized = false;

async function ensure_db_ready() {
	if (db_initialized) return;
	try {
		const { ensure_schema } = await import('$lib/server/db');
		await ensure_schema();
		db_initialized = true;
	} catch (error) {
		console.error('[Hooks] Database initialization failed:', error);
	}
}

// 1. Initializer handler for database
const init_handler: Handle = async ({ event, resolve }) => {
	if (!building && !db_initialized) {
		await ensure_db_ready();
	}
	return resolve(event);
};

// 2. Auth state and redirection logic handler
const auth_handler: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const { auth } = await import('$lib/auth');
	const { svelteKitHandler: s_handler } = await import('better-auth/svelte-kit');

	// Populate locals.user and locals.session by fetching session
	const session = await auth.api.getSession({
		headers: event.request.headers
	});

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	} else {
		event.locals.session = null;
		event.locals.user = null;
	}

	const pathname = event.url.pathname;
	const is_auth_page = pathname === '/' || pathname === '/signup';
	const is_auth_api = pathname.startsWith('/api/auth');
	const is_public_route = is_auth_page || is_auth_api;

	const is_authenticated = !!event.locals.user;

	// Redirection logic
	if (!is_authenticated && !is_public_route) {
		throw redirect(303, '/');
	}

	if (is_authenticated && is_auth_page) {
		throw redirect(303, '/home');
	}

	// For auth API routes, let svelteKitHandler handle them
	if (is_auth_api) {
		return s_handler({ event, resolve, auth, building });
	}

	return resolve(event);
};

export const handle = sequence(init_handler, auth_handler);
