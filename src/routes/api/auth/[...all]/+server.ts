import type { RequestHandler } from './$types';

// eslint-disable-next-line @typescript-eslint/naming-convention
export const GET: RequestHandler = async ({ request }) => {
	try {
		const { auth } = await import('$lib/auth');
		return auth.handler(request);
	} catch (error) {
		console.error('Auth GET error:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { auth } = await import('$lib/auth');
		return auth.handler(request);
	} catch (error) {
		console.error('Auth POST error:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
