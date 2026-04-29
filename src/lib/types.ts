export interface PostMetrics {
	likes?: number;
	dislikes?: number;
	reposts?: number;
}

export interface PostData {
	id: string;
	post_tag: string;
	post_tags?: string[];
	posted_at: string;
	content: string;
	audience?: string;
	author_name: string;
	author_handle: string;
	author_bio?: string;
	avatar_url?: string;
	verified?: boolean;
	metrics?: PostMetrics;
	user_liked?: boolean;
	user_disliked?: boolean;
	user_reposted?: boolean;
	is_author?: boolean;
	is_edited?: boolean;
	created_at?: string;
}
