import { building } from '$app/environment';
import { isRedirect, redirect, type Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}

	try {
		const { auth } = await import('$lib/auth');
		const { svelteKitHandler: svelte_kit_handler } = await import('better-auth/svelte-kit');
		let is_authenticated = false;

		try {
			const session = await auth.api.getSession({
				headers: event.request.headers
			});

			if (session) {
				event.locals.session = session.session;
				event.locals.user = session.user;
				is_authenticated = true;
			}
		} catch (session_error) {
			console.error('Session error:', session_error);
		}

		const pathname = event.url.pathname;
		const is_auth_page = pathname === '/' || pathname === '/signup';
		const is_auth_api = pathname.startsWith('/api/auth');
		const is_public_route = is_auth_page || is_auth_api;

		if (!is_authenticated && !is_public_route) {
			throw redirect(303, '/');
		}

		if (is_authenticated && is_auth_page) {
			throw redirect(303, '/home');
		}

		return svelte_kit_handler({ event, resolve, auth, building });
	} catch (error) {
		if (isRedirect(error)) {
			throw error;
		}

		console.error('Auth initialization error:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
