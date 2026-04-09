export function normalize_user_id_list(raw_user_ids: unknown): string[] {
	if (!Array.isArray(raw_user_ids)) return [];

	return Array.from(
		new Set(
			raw_user_ids
				.filter((user_id): user_id is string => typeof user_id === 'string')
				.map((user_id) => user_id.trim())
				.filter((user_id) => user_id.length > 0)
		)
	).slice(0, 100);
}

export function build_post_visibility_clause(current_user_id: string, post_alias = 'p') {
	return {
		clause: `(
			${post_alias}.author_id = ?
			OR ${post_alias}.audience = 'public'
			OR (
				${post_alias}.audience = 'followers_friends'
				AND (
					EXISTS(
						SELECT 1
						FROM follow f
						WHERE f.follower_id = ? AND f.following_id = ${post_alias}.author_id
					)
					OR EXISTS(
						SELECT 1
						FROM follow f
						WHERE f.follower_id = ${post_alias}.author_id AND f.following_id = ?
					)
				)
			)
			OR (
				${post_alias}.audience = 'close_friends'
				AND EXISTS(
					SELECT 1
					FROM post_visibility pv
					WHERE pv.post_id = ${post_alias}.id AND pv.user_id = ?
				)
			)
		)`,
		args: [current_user_id, current_user_id, current_user_id, current_user_id]
	};
}
