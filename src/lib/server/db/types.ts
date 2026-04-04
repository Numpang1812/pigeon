/**
 * TypeScript Type Definitions for Database Tables
 * 
 * These types map to the database schema and are used with Kysely
 * for type-safe SQL queries.
 */

import type { ColumnType } from 'kysely';

// Helper type for generated columns
type GeneratedDate = ColumnType<string, string | undefined, string>;

// ==========================================
// User (Extended from BetterAuth)
// ==========================================

export interface User {
	id: string;
	name: string;
	username: string | null;
	email: string;
	emailVerified: number | boolean;
	image: string | null;
	bio: string | null;
	location: string | null;
	website: string | null;
	birthdate: string | null;
	createdAt: GeneratedDate;
	updatedAt: GeneratedDate;
}

// ==========================================
// Post
// ==========================================

export type PostAudience = 'public' | 'followers_friends' | 'close_friends' | 'private';
export type PostTag = 'tech' | 'life' | 'design' | 'art' | 'gaming' | 'news' | 'other';

export interface Post {
	id: string;
	authorId: string;
	content: string;
	audience: PostAudience;
	postTag: PostTag;
	createdAt: GeneratedDate;
	updatedAt: GeneratedDate;
}

// ==========================================
// Post Media
// ==========================================

export type MediaType = 'image' | 'video';

export interface PostMedia {
	id: string;
	postId: string;
	mediaUrl: string;
	mediaType: MediaType;
	s3Key: string;
	thumbnailUrl: string | null;
	createdAt: GeneratedDate;
}

// ==========================================
// Comment
// ==========================================

export interface Comment {
	id: string;
	postId: string;
	authorId: string;
	content: string;
	createdAt: GeneratedDate;
	updatedAt: GeneratedDate;
}

// ==========================================
// Like
// ==========================================

export interface Like {
	id: string;
	userId: string;
	postId: string;
	createdAt: GeneratedDate;
}

// ==========================================
// Dislike
// ==========================================

export interface Dislike {
	id: string;
	userId: string;
	postId: string;
	createdAt: GeneratedDate;
}

// ==========================================
// Repost
// ==========================================

export interface Repost {
	id: string;
	userId: string;
	postId: string;
	createdAt: GeneratedDate;
}

// ==========================================
// Follow
// ==========================================

export interface Follow {
	id: string;
	followerId: string;
	followingId: string;
	createdAt: GeneratedDate;
}

// ==========================================
// Notification
// ==========================================

export type NotificationType = 'like' | 'comment' | 'follow' | 'mention' | 'reply';

export interface Notification {
	id: string;
	userId: string;
	type: NotificationType;
	sourceUserId: string | null;
	postId: string | null;
	commentId: string | null;
	read: number | boolean;
	createdAt: GeneratedDate;
}

// ==========================================
// Hashtag
// ==========================================

export interface Hashtag {
	id: string;
	tagName: string;
	usageCount: number;
}

// ==========================================
// Post Hashtag (Junction Table)
// ==========================================

export interface PostHashtag {
	postId: string;
	hashtagId: string;
}
