import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	if (building) {
		return resolve(event);
	}

	try {
		const { auth } = await import('$lib/auth');
		const { svelteKitHandler } = await import('better-auth/svelte-kit');

		try {
			const session = await auth.api.getSession({
				headers: event.request.headers
			});

			if (session) {
				event.locals.session = session.session;
				event.locals.user = session.user;
			}
		} catch (session_error) {
			console.error('Session error:', session_error);
		}

		return svelteKitHandler({ event, resolve, auth, building });
	} catch (error) {
		console.error('Auth initialization error:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
