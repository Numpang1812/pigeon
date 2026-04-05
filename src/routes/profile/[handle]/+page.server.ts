import type { PageServerLoad } from './$types';
import { ensure_schema } from '$lib/server/db';
import { error, redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import {
	get_profile_user_by_handle,
	get_follow_counts,
	get_access_state,
	get_profile_posts,
	map_profile,
	map_profile_posts
} from '$lib/server/profile-helpers';

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

	return {
		profile: map_profile(user, counts),
		posts: map_profile_posts(posts_result.rows, user),
		access
	};
};
