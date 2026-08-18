import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	get_home_coords,
	has_home_coords,
	list_active_flights
} from '$lib/server/pigeon-post';

export const load: PageServerLoad = async ({ locals }) => {
	const user_id = locals.user?.id;
	if (!user_id) throw redirect(303, '/');

	if (!(await has_home_coords(user_id))) {
		return {
			home_required: true,
			flights: [],
			user_loft: null,
			server_now: Date.now(),
			current_user_id: user_id
		};
	}

	const [flights, user_loft] = await Promise.all([
		list_active_flights(user_id),
		get_home_coords(user_id)
	]);

	return {
		home_required: false,
		flights,
		user_loft,
		server_now: Date.now(),
		current_user_id: user_id
	};
};
