/**
 * In-Memory Sliding Window Rate Limiter
 *
 * Tracks request timestamps per user in a Map and enforces
 * a maximum number of requests within a sliding time window.
 *
 * - Ephemeral (no persistence across server restarts)
 * - Fast (no DB round-trips)
 * - Self-cleaning (stale entries removed on each check)
 */

interface RateLimitResult {
	allowed: boolean;
	retry_after_ms?: number; // How long until the user can make another request
}

export class RateLimiter {
	private requests: Map<string, number[]> = new Map();

	/**
	 * Check if a request is allowed.
	 *
	 * @param key - Unique identifier (e.g. user ID)
	 * @param limit - Maximum requests allowed in the window (usually 1 for post rate limiting)
	 * @param windowMs - Sliding window duration in milliseconds
	 * @returns { allowed: true } or { allowed: false, retryAfterMs: <ms to wait> }
	 */
	check(key: string, limit: number, windowMs: number): RateLimitResult {
		const now = Date.now();
		const timestamps = this.requests.get(key) || [];

		// Remove expired timestamps (outside the window)
		const active_timestamps = timestamps.filter((ts) => now - ts < windowMs);

		if (active_timestamps.length >= limit) {
			// Rate limited — calculate how long until the oldest active timestamp expires
			const oldest_in_window = active_timestamps[0];
			const retry_after_ms = windowMs - (now - oldest_in_window);

			this.requests.set(key, active_timestamps);
			return { allowed: false, retry_after_ms: Math.max(retry_after_ms, 0) };
		}

		// Allow the request and record the timestamp
		active_timestamps.push(now);
		this.requests.set(key, active_timestamps);
		return { allowed: true };
	}

	/**
	 * Reset rate limit for a specific key.
	 */
	reset(key: string): void {
		this.requests.delete(key);
	}

	/**
	 * Clear all rate limit data (useful for testing).
	 */
	clear(): void {
		this.requests.clear();
	}
}

// Named instances for different action types
export const post_create_limiter = new RateLimiter();
export const post_edit_limiter = new RateLimiter();
export const post_reaction_limiter = new RateLimiter();
export const post_repost_limiter = new RateLimiter();
export const profile_image_limiter = new RateLimiter();
