import type { PageServerLoad } from './$types';
import { ensure_schema } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/auth';
import {
	get_profile_user_by_id,
	get_follow_counts,
	map_profile,
	get_profile_post_sections,
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
	const [counts, post_sections] = await Promise.all([
		get_follow_counts(session.user.id),
		get_profile_post_sections(session.user.id, session.user.id, is_owner, user)
	]);
	const [followers, following] = await Promise.all([
		get_profile_followers(session.user.id),
		get_profile_following(session.user.id)
	]);

	return {
		profile: map_profile(user, counts),
		posts: post_sections.posts,
		reposted_posts: post_sections.reposted_posts,
		liked_posts: post_sections.liked_posts,
		followers,
		following,
		access: {
			is_owner: true,
			is_following: false
		}
	};
};
