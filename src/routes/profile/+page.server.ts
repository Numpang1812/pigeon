import type { PageServerLoad } from './$types';
import { ensure_schema } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import {
	get_profile_user_by_id,
	get_follow_counts,
	map_profile,
	map_profile_posts,
	get_profile_posts,
	get_profile_followers,
	get_profile_following
} from '$lib/server/profile-helpers';

export const load: PageServerLoad = async ({ request }) => {
	await ensure_schema();

	const session = await auth.api.getSession({
		headers: request.headers
	});

	if (!session) {
		throw redirect(302, '/');
	}

	const user = await get_profile_user_by_id(session.user.id);

	if (!user) {
		throw redirect(302, '/');
	}

	const is_owner = true;
	const [counts, posts_result] = await Promise.all([
		get_follow_counts(session.user.id),
		get_profile_posts(session.user.id, session.user.id, is_owner)
	]);
	const [followers, following] = await Promise.all([
		get_profile_followers(session.user.id),
		get_profile_following(session.user.id)
	]);

	return {
		profile: map_profile(user, counts),
		posts: map_profile_posts(posts_result.rows, user),
		followers,
		following,
		access: {
			is_owner: true,
			is_following: false
		}
	};
};
