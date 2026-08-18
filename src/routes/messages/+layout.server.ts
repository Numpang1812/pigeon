import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import {
	count_unread_conversations,
	get_flock_state,
	get_next_arrival_at,
	has_home_coords,
	list_inbox
} from '$lib/server/pigeon-post';

/**
 * The inbox, the flock, and the single timestamp the client schedules against.
 *
 * hooks.server.ts already redirects unauthenticated users away from anything
 * outside the public routes, so reaching here means there is a session.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const user_id = locals.user?.id;
	if (!user_id) throw redirect(303, '/');

	// Without coordinates there is no distance, so pigeon post cannot work at
	// all — in either direction. The page shows the loft gate instead.
	if (!(await has_home_coords(user_id))) {
		return {
			home_required: true,
			conversations: [],
			unread_conversations: 0,
			next_arrival_at: null,
			flock: { size: 0, in_flight: 0, available: 0, next_available_at: null },
			server_now: Date.now(),
			current_user_id: user_id
		};
	}

	const [conversations, unread_conversations, next_arrival_at, flock] = await Promise.all([
		list_inbox(user_id),
		count_unread_conversations(user_id),
		get_next_arrival_at(user_id),
		get_flock_state(user_id)
	]);

	return {
		home_required: false,
		conversations,
		unread_conversations,
		// Scheduling only — never rendered.
		next_arrival_at,
		flock,
		server_now: Date.now(),
		current_user_id: user_id
	};
};
