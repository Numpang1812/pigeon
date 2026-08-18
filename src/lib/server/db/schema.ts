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
	// BetterAuth core tables
	user: `
		CREATE TABLE IF NOT EXISTS user (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			emailVerified INTEGER NOT NULL DEFAULT 0,
			image TEXT,
			createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
			updatedAt DATETIME NOT NULL DEFAULT (datetime('now')),
			username TEXT UNIQUE,
			bio TEXT,
			location TEXT,
			website TEXT,
			cover TEXT,
			failed_login_attempts INTEGER NOT NULL DEFAULT 0,
			lockout_until TEXT,
			verified INTEGER NOT NULL DEFAULT 0
		)
	`,
	// Home loft coordinates for pigeon post. Separate ALTER TABLE entries because
	// CREATE TABLE IF NOT EXISTS is a no-op on the already-deployed user table;
	// handle_table_creation tolerates the resulting "duplicate column" error.
	user_home_lat: `ALTER TABLE user ADD COLUMN home_lat REAL`,
	user_home_lng: `ALTER TABLE user ADD COLUMN home_lng REAL`,
	user_home_accuracy_m: `ALTER TABLE user ADD COLUMN home_accuracy_m REAL`,
	user_home_set_at: `ALTER TABLE user ADD COLUMN home_set_at TEXT`,

	session: `
		CREATE TABLE IF NOT EXISTS session (
			id TEXT PRIMARY KEY,
			expiresAt DATETIME NOT NULL,
			token TEXT NOT NULL UNIQUE,
			createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
			updatedAt DATETIME NOT NULL DEFAULT (datetime('now')),
			ipAddress TEXT,
			userAgent TEXT,
			userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
		)
	`,
	account: `
		CREATE TABLE IF NOT EXISTS account (
			id TEXT PRIMARY KEY,
			accountId TEXT NOT NULL,
			providerId TEXT NOT NULL,
			userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			accessToken TEXT,
			refreshToken TEXT,
			idToken TEXT,
			accessTokenExpiresAt DATETIME,
			refreshTokenExpiresAt DATETIME,
			scope TEXT,
			password TEXT,
			createdAt DATETIME NOT NULL DEFAULT (datetime('now')),
			updatedAt DATETIME NOT NULL DEFAULT (datetime('now'))
		)
	`,

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

	// ==========================================
	// Pigeon Post (distance-delayed messaging)
	// ==========================================
	//
	// No CHECK constraints anywhere below. Extending a CHECK in SQLite requires a
	// full table rebuild, which is the trap notification.type above already fell
	// into. kind / status / role / media_type are validated in TypeScript instead.

	// Conversations, 1:1 and group. Carries no last_message_* columns: with
	// distance-delayed delivery, "the latest message" differs per viewer, and a
	// bird still in the air is not yet anyone's latest message.
	conversation: `
		CREATE TABLE IF NOT EXISTS conversation (
			id TEXT PRIMARY KEY,
			kind TEXT NOT NULL DEFAULT 'direct',
			title TEXT,
			created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
			direct_key TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		)
	`,

	conversation_participant: `
		CREATE TABLE IF NOT EXISTS conversation_participant (
			conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
			user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			role TEXT NOT NULL DEFAULT 'member',
			last_read_at TEXT,
			joined_at TEXT NOT NULL DEFAULT (datetime('now')),
			left_at TEXT,
			PRIMARY KEY (conversation_id, user_id)
		)
	`,

	// Distance between a user pair, computed once and reused. Ids are stored
	// sorted, so (a,b) and (b,a) are the same row. Deleted for both directions
	// whenever either user moves.
	user_distance: `
		CREATE TABLE IF NOT EXISTS user_distance (
			user_a_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			user_b_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			distance_km REAL NOT NULL,
			computed_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (user_a_id, user_b_id)
		)
	`,

	// One row per released bird. The pigeon is occupied while available_at > now,
	// so nothing ever sweeps this table: availability is evaluated per query.
	// route_json holds FUZZED coordinates only, for drawing the map.
	pigeon_flight: `
		CREATE TABLE IF NOT EXISTS pigeon_flight (
			id TEXT PRIMARY KEY,
			sender_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
			route_json TEXT NOT NULL,
			total_distance_km REAL NOT NULL,
			departed_at TEXT NOT NULL,
			available_at TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'in_flight',
			recalled_at TEXT
		)
	`,

	message: `
		CREATE TABLE IF NOT EXISTS message (
			id TEXT PRIMARY KEY,
			conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
			flight_id TEXT NOT NULL REFERENCES pigeon_flight(id) ON DELETE CASCADE,
			sender_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			body TEXT NOT NULL DEFAULT '',
			attachment_count INTEGER NOT NULL DEFAULT 0,
			departed_at TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			deleted_at TEXT
		)
	`,

	// Per-recipient arrival. deliver_at <= now IS the delivery mechanism: there
	// is no job, no cron and no queue, only this predicate in the read query.
	// distance_km is the cumulative distance flown to reach this recipient.
	message_delivery: `
		CREATE TABLE IF NOT EXISTS message_delivery (
			message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
			recipient_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			leg_order INTEGER NOT NULL DEFAULT 0,
			distance_km REAL NOT NULL,
			deliver_at TEXT NOT NULL,
			cancelled_at TEXT,
			PRIMARY KEY (message_id, recipient_id)
		)
	`,

	// Modeled on post_media above.
	message_attachment: `
		CREATE TABLE IF NOT EXISTS message_attachment (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
			media_url TEXT NOT NULL,
			media_type TEXT NOT NULL DEFAULT 'image',
			storage_key TEXT NOT NULL DEFAULT '',
			file_name TEXT,
			byte_size INTEGER,
			width INTEGER,
			height INTEGER,
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
	`,
	verification: `
		CREATE TABLE IF NOT EXISTS verification (
			id TEXT PRIMARY KEY,
			identifier TEXT NOT NULL,
			value TEXT NOT NULL,
			expiresAt DATETIME NOT NULL,
			createdAt DATETIME DEFAULT (datetime('now')),
			updatedAt DATETIME DEFAULT (datetime('now'))
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

	// Pigeon post indexes.
	// idx_conversation_direct_key MUST be declared here rather than as an inline
	// UNIQUE column constraint: an inline constraint can only ever apply when the
	// table is first created, whereas this index can be added to a live table.
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_direct_key ON conversation(direct_key)`,
	`CREATE INDEX IF NOT EXISTS idx_conversation_participant_user ON conversation_participant(user_id, conversation_id)`,
	`CREATE INDEX IF NOT EXISTS idx_user_distance_b ON user_distance(user_b_id)`,
	`CREATE INDEX IF NOT EXISTS idx_pigeon_flight_sender_available ON pigeon_flight(sender_id, available_at)`,
	`CREATE INDEX IF NOT EXISTS idx_message_conversation_departed ON message(conversation_id, departed_at, id)`,
	// The workhorse: arrival filter, unread count, inbox ordering, next arrival.
	`CREATE INDEX IF NOT EXISTS idx_message_delivery_recipient ON message_delivery(recipient_id, deliver_at)`,
	`CREATE INDEX IF NOT EXISTS idx_message_delivery_message ON message_delivery(message_id)`,
	`CREATE INDEX IF NOT EXISTS idx_message_attachment_message ON message_attachment(message_id)`,

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
	postHashtag: 'post_hashtag',
	conversation: 'conversation',
	conversationParticipant: 'conversation_participant',
	userDistance: 'user_distance',
	pigeonFlight: 'pigeon_flight',
	message: 'message',
	messageDelivery: 'message_delivery',
	messageAttachment: 'message_attachment'
} as const;
