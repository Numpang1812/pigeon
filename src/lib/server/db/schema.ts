/**
 * Database Schema Definitions
 * 
 * All table definitions for the Pigeon application.
 * These schemas will be created in the Turso database on initialization.
 */

// ==========================================
// Table Creation SQL Statements
// ==========================================

export const create_tables_sql = {
	// BetterAuth manages these tables automatically:
	// - user
	// - session
	// - account
	// - verification

	// User table modifications (BetterAuth creates the base table)
	add_username: `
		ALTER TABLE user ADD COLUMN username TEXT
	`,

	// User profile extensions (BetterAuth doesn't include these)
	add_bio: `ALTER TABLE user ADD COLUMN bio TEXT`,
	add_location: `ALTER TABLE user ADD COLUMN location TEXT`,
	add_website: `ALTER TABLE user ADD COLUMN website TEXT`,
	add_cover: `ALTER TABLE user ADD COLUMN cover TEXT`,

	// Account lockout for rate limiting
	add_failed_login_attempts: `ALTER TABLE user ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`,
	add_lockout_until: `ALTER TABLE user ADD COLUMN lockout_until TEXT`,

	// Application tables - Posts
	post: `
		CREATE TABLE IF NOT EXISTS post (
			id TEXT PRIMARY KEY,
			author_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			audience TEXT NOT NULL DEFAULT 'public',
			post_tag TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`,

	post_visibility: `
		CREATE TABLE IF NOT EXISTS post_visibility (
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (post_id, user_id)
		)
	`,

	// Post Media (images/videos from S3)
	post_media: `
		CREATE TABLE IF NOT EXISTS post_media (
			id TEXT PRIMARY KEY,
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			media_url TEXT NOT NULL,
			media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
			s3_key TEXT NOT NULL,
			thumbnail_url TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`,

	// Comments (replies to posts)
	comment: `
		CREATE TABLE IF NOT EXISTS comment (
			id TEXT PRIMARY KEY,
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			author_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			content TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`,

	// Likes (many-to-many relationship)
	like: `
		CREATE TABLE IF NOT EXISTS like (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, post_id)
		)
	`,

	// Dislikes (many-to-many relationship)
	dislike: `
		CREATE TABLE IF NOT EXISTS dislike (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, post_id)
		)
	`,

	// Reposts/Retweets (many-to-many relationship)
	repost: `
		CREATE TABLE IF NOT EXISTS repost (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, post_id)
		)
	`,

	// Follow relationships (many-to-many)
	follow: `
		CREATE TABLE IF NOT EXISTS follow (
			id TEXT PRIMARY KEY,
			follower_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			following_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(follower_id, following_id)
		)
	`,

	// Notifications
	notification: `
		CREATE TABLE IF NOT EXISTS notification (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			type TEXT NOT NULL CHECK(type IN ('like', 'comment', 'follow', 'mention', 'reply')),
			source_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
			post_id TEXT REFERENCES post(id) ON DELETE SET NULL,
			comment_id TEXT REFERENCES comment(id) ON DELETE SET NULL,
			read INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`,

	// Hashtags/Tags
	hashtag: `
		CREATE TABLE IF NOT EXISTS hashtag (
			id TEXT PRIMARY KEY,
			tag_name TEXT NOT NULL UNIQUE COLLATE NOCASE,
			usage_count INTEGER NOT NULL DEFAULT 0
		)
	`,

	// Post-Hashtag mapping (many-to-many)
	post_hashtag: `
		CREATE TABLE IF NOT EXISTS post_hashtag (
			post_id TEXT NOT NULL REFERENCES post(id) ON DELETE CASCADE,
			hashtag_id TEXT NOT NULL REFERENCES hashtag(id) ON DELETE CASCADE,
			PRIMARY KEY (post_id, hashtag_id)
		)
	`
} as const;

// ==========================================
// Backfill SQL for Existing Users
// ==========================================

export const backfill_sql = [
	// Auto-generate usernames for existing users who don't have one
	`UPDATE user SET username = 'user_' || SUBSTR(id, 1, 8) WHERE username IS NULL`
] as const;

// ==========================================
// Index Creation for Performance
// ==========================================

export const create_indexes_sql = [
	// Post indexes
	`CREATE INDEX IF NOT EXISTS idx_post_author_id ON post(author_id)`,
	`CREATE INDEX IF NOT EXISTS idx_post_created_at ON post(created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_post_tag ON post(post_tag)`,
	`CREATE INDEX IF NOT EXISTS idx_post_visibility_user ON post_visibility(user_id)`,

	// Post media indexes
	`CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id)`,

	// Comment indexes
	`CREATE INDEX IF NOT EXISTS idx_comment_post_id ON comment(post_id)`,
	`CREATE INDEX IF NOT EXISTS idx_comment_author_id ON comment(author_id)`,
	`CREATE INDEX IF NOT EXISTS idx_comment_created ON comment(post_id, created_at DESC)`,

	// Like indexes
	`CREATE INDEX IF NOT EXISTS idx_like_user_id ON like(user_id)`,
	`CREATE INDEX IF NOT EXISTS idx_like_post_id ON like(post_id)`,

	// Dislike indexes
	`CREATE INDEX IF NOT EXISTS idx_dislike_user_id ON dislike(user_id)`,
	`CREATE INDEX IF NOT EXISTS idx_dislike_post_id ON dislike(post_id)`,

	// Repost indexes
	`CREATE INDEX IF NOT EXISTS idx_repost_user_id ON repost(user_id)`,
	`CREATE INDEX IF NOT EXISTS idx_repost_post_id ON repost(post_id)`,

	// Follow indexes
	`CREATE INDEX IF NOT EXISTS idx_follow_follower ON follow(follower_id)`,
	`CREATE INDEX IF NOT EXISTS idx_follow_following ON follow(following_id)`,

	// Notification indexes
	`CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_notification_unread ON notification(user_id, read)`,

	// Hashtag indexes
	`CREATE INDEX IF NOT EXISTS idx_hashtag_name ON hashtag(tag_name)`,

	// Post hashtag indexes
	`CREATE INDEX IF NOT EXISTS idx_post_hashtag_post ON post_hashtag(post_id)`,
	`CREATE INDEX IF NOT EXISTS idx_post_hashtag_hashtag ON post_hashtag(hashtag_id)`
] as const;

// ==========================================
// Table Names
// ==========================================

export const table_names = {
	post: 'post',
	postMedia: 'post_media',
	postVisibility: 'post_visibility',
	comment: 'comment',
	like: 'like',
	dislike: 'dislike',
	repost: 'repost',
	follow: 'follow',
	notification: 'notification',
	hashtag: 'hashtag',
	postHashtag: 'post_hashtag'
} as const;
