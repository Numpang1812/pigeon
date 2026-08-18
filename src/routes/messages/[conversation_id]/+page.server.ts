import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { flight_ms_for_km } from '$lib/pigeon/flight';
import {
	get_conversation_meta,
	get_flock_state,
	get_pair_distances_km,
	get_thread,
	mark_conversation_read,
	PigeonError
} from '$lib/server/pigeon-post';

/**
 * One conversation.
 *
 * Opening it marks it read, so the navigation badge clears without a separate
 * request. Distances are attached so the composer can state the cost of a send
 * before a bird is spent.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const user_id = locals.user?.id;
	if (!user_id) throw redirect(303, '/');

	const conversation_id = params.conversation_id;

	try {
		const [conversation, thread, flock] = await Promise.all([
			get_conversation_meta(conversation_id, user_id),
			get_thread(conversation_id, user_id),
			get_flock_state(user_id)
		]);

		const distances = await get_pair_distances_km(
			user_id,
			conversation.participants.map((participant) => participant.id)
		);

		// Marked read after the thread is read, so the response reflects what the
		// user is actually about to see.
		await mark_conversation_read(conversation_id, user_id);

		const recipients = conversation.participants.map((participant) => {
			const distance_km = distances.get(participant.id) ?? null;

			return {
				...participant,
				distance_km,
				flight_ms: distance_km === null ? null : flight_ms_for_km(distance_km)
			};
		});

		const nearest =
			recipients
				.filter((recipient) => recipient.distance_km !== null)
				.sort((a, b) => (a.distance_km as number) - (b.distance_km as number))
				.at(0) ?? null;

		return {
			conversation,
			recipients,
			nearest,
			messages: thread.messages,
			flock,
			server_now: thread.server_now,
			current_user_id: user_id
		};
	} catch (failure) {
		if (failure instanceof PigeonError) throw error(failure.status, failure.message);
		throw failure;
	}
};
