export type ProfilePostMetrics = {
	likes: number;
	dislikes: number;
	reposts: number;
};

export type ProfilePost = {
	id: string;
	post_tag: string;
	post_tags: string[];
	posted_at: string;
	author_name: string;
	author_handle: string;
	content: string;
	audience: string;
	author_bio: string;
	verified: boolean;
	metrics: ProfilePostMetrics;
	user_liked: boolean;
	user_disliked: boolean;
	user_reposted: boolean;
	avatar_url: string;
	is_author?: boolean;
	is_edited?: boolean;
};

export type ProfilePostMetricChange = {
	likes: number;
	dislikes: number;
	reposts: number;
	user_liked: boolean;
	user_disliked: boolean;
	user_reposted: boolean;
};

export type ProfileConnection = {
	id: string;
	name: string;
	handle: string;
	avatar: string;
	verified: boolean;
	followed_at: string;
};

export type ProfileAccess = {
	is_owner?: boolean;
	is_following?: boolean;
};

export type ProfileData = {
	profile: {
		id: string;
		name: string;
		handle: string;
		bio: string;
		joined: string;
		avatar: string;
		cover: string;
		verified: boolean;
		following: number;
		followers: number;
	};
	posts: ProfilePost[];
	reposted_posts: ProfilePost[];
	liked_posts: ProfilePost[];
	followers: ProfileConnection[];
	following: ProfileConnection[];
	access?: ProfileAccess;
};
