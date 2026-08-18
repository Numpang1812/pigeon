/**
 * Clock and duration helpers for pigeon post.
 *
 * A flight can last days, so a browser clock that is minutes out stays minutes
 * out for the whole journey. Every payload carrying flight data includes
 * server_now; the offset derived from it is added to every local clock read.
 */

/** Parses the 'YYYY-MM-DD HH:MM:SS.mmm' UTC form the server writes. */
export function epoch_from_sql(value: string | null | undefined): number | null {
	if (!value) return null;

	const parsed = new Date(`${value.replace(' ', 'T')}Z`).getTime();

	return Number.isFinite(parsed) ? parsed : null;
}

/** How far this browser's clock is from the server's. Add it to Date.now(). */
export function clock_offset_from(server_now: number | null | undefined): number {
	if (!server_now || !Number.isFinite(server_now)) return 0;

	return server_now - Date.now();
}

const minute_ms = 60_000;
const hour_ms = 3_600_000;
const day_ms = 86_400_000;

/**
 * A duration in the coarsest useful terms: '3d 4h', '6h 20m', '45m', 'under a minute'.
 *
 * Flights routinely run to days, so seconds are never shown — they would imply
 * a precision the estimate does not have.
 */
export function format_duration(duration_ms: number): string {
	if (duration_ms <= 0) return 'now';
	if (duration_ms < minute_ms) return 'under a minute';

	if (duration_ms < hour_ms) {
		return `${Math.round(duration_ms / minute_ms)}m`;
	}

	if (duration_ms < day_ms) {
		const hours = Math.floor(duration_ms / hour_ms);
		const minutes = Math.round((duration_ms % hour_ms) / minute_ms);
		return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
	}

	const days = Math.floor(duration_ms / day_ms);
	const hours = Math.round((duration_ms % day_ms) / hour_ms);

	return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/** 'arrives in 2d 6h', or 'arrived' once the moment has passed. */
export function format_eta(target_ms: number | null, now_ms: number): string {
	if (target_ms === null) return '';
	if (target_ms <= now_ms) return 'arrived';

	return `arrives in ${format_duration(target_ms - now_ms)}`;
}

/** '4,350 km', with thousands separators and no misleading decimals. */
export function format_distance(distance_km: number | null | undefined): string {
	if (distance_km === null || distance_km === undefined) return '';
	if (distance_km < 10) return `${distance_km.toFixed(1)} km`;

	return `${Math.round(distance_km).toLocaleString('en-US')} km`;
}
