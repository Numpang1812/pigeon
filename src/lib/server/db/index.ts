/**
 * Kysely Database Type Definition
 * 
 * This interface maps all database tables to their TypeScript types
 * enabling type-safe SQL queries with Kysely.
 */

import type {
	User,
	Post,
	PostMedia,
	Comment,
	Like,
	Follow,
	Notification,
	Hashtag,
	PostHashtag
} from './types';

// ==========================================
// Main Database Interface
// ==========================================

export interface Database {
	user: User;
	post: Post;
	post_media: PostMedia;
	comment: Comment;
	like: Like;
	follow: Follow;
	notification: Notification;
	hashtag: Hashtag;
	post_hashtag: PostHashtag;
	// BetterAuth tables (managed automatically)
	session: Session;
	account: Account;
	verification: Verification;
}

// ==========================================
// BetterAuth Table Types
// ==========================================

export interface Session {
	id: string;
	expiresAt: Date;
	token: string;
	createdAt: Date;
	updatedAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
	userId: string;
}

export interface Account {
	id: string;
	accountId: string;
	providerId: string;
	userId: string;
	accessToken: string | null;
	refreshToken: string | null;
	idToken: string | null;
	accessTokenExpiresAt: Date | null;
	refreshTokenExpiresAt: Date | null;
	scope: string | null;
	password: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface Verification {
	id: string;
	identifier: string;
	value: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
}
