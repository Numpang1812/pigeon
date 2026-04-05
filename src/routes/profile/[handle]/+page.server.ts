import type { PageServerLoad } from './$types';
import { ensure_schema } from '$lib/server/db';
import { error, redirect, fail } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import { normalize_handle } from '$lib';
import {
	get_profile_user_by_handle,
	get_follow_counts,
	get_access_state,
	get_profile_posts,
	map_profile,
	map_profile_posts,
	get_profile_followers,
	get_profile_following,
	toggle_follow_relationship,
	create_follow_notification
} from '$lib/server/profile-helpers';
import type { Actions } from './$types';

export const load: PageServerLoad = async ({ params, request }) => {
	await ensure_schema();

	const session = await auth.api.getSession({
		headers: request.headers
	});

	if (!session) {
		throw redirect(302, '/');
	}

	const handle = params.handle?.trim();
	if (!handle) {
		throw error(404, 'User not found');
	}

	const user = await get_profile_user_by_handle(handle);

	if (!user) {
		throw error(404, 'User not found');
	}

	const profile_user_id = user.id as string;
	const is_owner = profile_user_id === session.user.id;
	const [counts, access, posts_result] = await Promise.all([
		get_follow_counts(profile_user_id),
		get_access_state(session.user.id, profile_user_id, is_owner),
		get_profile_posts(session.user.id, profile_user_id, is_owner)
	]);
	const [followers, following] = await Promise.all([
		get_profile_followers(profile_user_id),
		get_profile_following(profile_user_id)
	]);

	return {
		profile: map_profile(user, counts),
		posts: map_profile_posts(posts_result.rows, user, session.user.id),
		followers,
		following,
		access
	};
};

export const actions: Actions = {
	toggle_follow: async ({ request, params }) => {
		await ensure_schema();

		const session = await auth.api.getSession({
			headers: request.headers
		});

		if (!session) {
			return fail(401, { message: 'Unauthorized' });
		}

		const handle = params.handle?.trim();
		if (!handle) {
			return fail(400, { message: 'User not found' });
		}

		const user = await get_profile_user_by_handle(handle);
		if (!user) {
			return fail(404, { message: 'User not found' });
		}

		const target_user_id = user.id as string;
		if (target_user_id === session.user.id) {
			return fail(400, { message: 'You cannot follow yourself' });
		}

		const result = await toggle_follow_relationship(session.user.id, target_user_id);
		if (result.is_following) {
			await create_follow_notification(target_user_id, session.user.id);
		}

		throw redirect(303, `/profile/${normalize_handle(handle)}`);
	}
};
