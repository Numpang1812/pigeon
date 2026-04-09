import { building } from '$app/environment';
import { json, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// ==========================================
// Constants
// ==========================================

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const SECURITY_HEADERS = {
	'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
};

// ==========================================
// 1. Security Headers Handler
// ==========================================

const security_headers_handler: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Apply security headers to all responses
	for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(header, value);
	}

	// HSTS only on HTTPS
	if (event.url.protocol === 'https:') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	// Remove X-Powered-By header
	response.headers.delete('x-powered-by');

	return response;
};

// ==========================================
// 2. CSRF Protection Handler (Origin Header Check)
// ==========================================

const csrf_handler: Handle = async ({ event, resolve }) => {
	// Allow safe methods without CSRF check
	if (SAFE_METHODS.has(event.request.method)) {
		return resolve(event);
	}

	const origin = event.request.headers.get('origin');
	const host = event.url.origin;

	// If Origin header is present and doesn't match our host, reject
	// Browsers always send Origin on cross-origin requests
	if (origin && origin !== host) {
		console.warn(`[CSRF] Blocked cross-origin request: ${origin} -> ${host} (${event.request.method} ${event.url.pathname})`);
		return json(
			{ error: 'Cross-origin requests are not allowed' },
			{ status: 403 }
		);
	}

	return resolve(event);
};

// ==========================================
// 3. Database Initialization Handler
// ==========================================

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

const init_handler: Handle = async ({ event, resolve }) => {
	if (!building && !db_initialized) {
		await ensure_db_ready();
	}
	return resolve(event);
};

// ==========================================
// 4. Auth State and Redirection Handler
// ==========================================

const auth_handler: Handle = async ({ event, resolve }) => {
	if (building) return resolve(event);

	const { auth } = await import('$lib/auth');
	const { svelteKitHandler: s_handler } = await import('better-auth/svelte-kit');

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

	if (!is_authenticated && !is_public_route) {
		throw redirect(303, '/');
	}

	if (is_authenticated && is_auth_page) {
		throw redirect(303, '/home');
	}

	if (is_auth_api) {
		return s_handler({ event, resolve, auth, building });
	}

	return resolve(event);
};

// ==========================================
// Export (order matters: first handler runs first)
// ==========================================

export const handle = sequence(
	security_headers_handler,
	csrf_handler,
	init_handler,
	auth_handler
);
