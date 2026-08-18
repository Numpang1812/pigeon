import { json, type RequestHandler } from '@sveltejs/kit';
import { recall_pigeon } from '$lib/server/pigeon-post';
import { require_user, to_error_response } from '$lib/server/pigeon-api';

/**
 * Call a bird back.
 *
 * Undelivered recipients never receive the message; anyone the pigeon already
 * reached keeps theirs. The return leg is flown from wherever the bird is, so a
 * recall is not free — the pigeon stays busy until it is home.
 */

// eslint-disable-next-line @typescript-eslint/naming-convention
export const POST: RequestHandler = async ({ request, params }) => {
	try {
		const user = await require_user(request);

		return json(await recall_pigeon(params.flight_id as string, user.id));
	} catch (error) {
		return to_error_response(error, 'Failed to recall pigeon');
	}
};
