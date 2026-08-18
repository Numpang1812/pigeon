/**
 * Arrival watching — the replacement for polling.
 *
 * Every pigeon has a known arrival timestamp, so instead of asking the server
 * repeatedly whether anything has changed, the client sets ONE timer for the
 * exact moment the next bird lands. A ten-day flight costs zero requests.
 *
 * next_arrival_at is used for scheduling only and must never be rendered:
 * telling a recipient that something arrives in three days spoils the arrival
 * and reveals that someone is writing to them.
 */

import { writable } from 'svelte/store';
import { invalidateAll } from '$app/navigation';
import { clock_offset_from, epoch_from_sql } from './clock';

export const unread_conversations = writable(0);

/** Fired after an arrival refresh, so any component can react to one signal. */
export const arrival_event_name = 'pigeon-arrived';

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Timers are re-armed at most this far ahead rather than scheduled days out.
 * Long timers survive poorly across laptop sleep and suspend, and re-arming a
 * handful of times over a ten-day flight costs nothing.
 */
const max_timer_ms = 6 * 60 * 60 * 1000;

export function set_unread_conversations(count: number): void {
	unread_conversations.set(count);
}

/** Schedule a refresh for the moment the next pigeon lands. */
export function schedule_arrival(next_arrival_at: string | null, server_now: number | null): void {
	stop_arrival_watch();

	const arrival_ms = epoch_from_sql(next_arrival_at);
	if (arrival_ms === null) return;

	const offset = clock_offset_from(server_now);
	// One second of slack, so the server's deliver_at <= now comparison has
	// definitely tipped over by the time the request lands.
	const wait_ms = Math.max(arrival_ms - (Date.now() + offset), 0) + 1000;

	if (wait_ms > max_timer_ms) {
		timer = setTimeout(() => schedule_arrival(next_arrival_at, server_now), max_timer_ms);
		return;
	}

	timer = setTimeout(() => {
		void handle_arrival();
	}, wait_ms);
}

async function handle_arrival(): Promise<void> {
	await invalidateAll();
	await refresh_unread();

	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent(arrival_event_name));
	}
}

/** Refresh the badge and re-arm the timer from whatever the server now reports. */
export async function refresh_unread(): Promise<void> {
	try {
		const response = await fetch('/api/pigeon/unread-count');
		if (!response.ok) return;

		const payload = await response.json();
		unread_conversations.set(Number(payload.unread_conversations ?? 0));
		schedule_arrival(payload.next_arrival_at ?? null, payload.server_now ?? null);
	} catch {
		// Offline or mid-navigation. The next visibility change will retry.
	}
}

export function stop_arrival_watch(): void {
	clearTimeout(timer);
	timer = undefined;
}

/**
 * Starts watching. Returns a teardown function for use in an $effect.
 *
 * Also refreshes when the tab becomes visible again, which covers a machine
 * that was asleep straight through an arrival.
 */
export function start_arrival_watch(): () => void {
	void refresh_unread();

	const handle_visibility = () => {
		if (document.visibilityState === 'visible') void refresh_unread();
	};

	document.addEventListener('visibilitychange', handle_visibility);
	window.addEventListener('focus', handle_visibility);

	return () => {
		document.removeEventListener('visibilitychange', handle_visibility);
		window.removeEventListener('focus', handle_visibility);
		stop_arrival_watch();
	};
}
