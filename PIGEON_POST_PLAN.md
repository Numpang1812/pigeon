# Pigeon Post — distance-delayed messaging

## Context

Pigeon needs messaging between friends (mutual follows). But not chat — **pigeon post**.

A message is carried by an E-Pigeon that flies from sender to recipient at real homing-pigeon speed, in a straight line. Delivery time is the distance divided by that speed, uncapped. Phnom Penh to Bangkok arrives in under 7 hours; Phnom Penh to Lima takes ten days. While in flight, the sender watches the bird cross a map with a live ETA.

Each user owns a **flock of pigeons**. Sending occupies a bird for the entire round trip — out to the recipient and back home again. Run out of pigeons and you cannot send at all until one lands. The scarcity is the product: you think hard about what you say, because you are spending a bird and possibly a week to say it.

The delay is the mechanic, not a delay bolted onto chat. That changes the engineering favourably.

### Why this is cheaper than realtime chat

The original WebSocket question dissolves. Three properties fall out of the design:

1. **Delivery is a query predicate, not a job.** `deliver_at` is computed at send time. The recipient's read query filters `WHERE deliver_at <= <now>`. No cron, no scheduled function, no worker, no queue — a message simply isn't visible until its arrival timestamp passes.
2. **Flight needs zero requests.** The client knows `departed_at`, `deliver_at`, and both endpoints. Position, ETA, and the animation are computed locally from the clock. A ten-day flight costs zero network traffic.
3. **The flock caps total system volume.** 10 pigeons per user, each occupied for a round trip, is a hard ceiling on messages in existence. Turso row reads stay small by construction — the system cannot get chatty.

No polling ladder. Arrival is a known future timestamp, so the client sets one timer for exactly that moment.

### Confirmed decisions

| Decision | Choice |
|---|---|
| Speed / bounds | 80 km/h, **uncapped**. Cross-globe messages take days. |
| Location | **Exact device coordinates** via browser Geolocation, captured once at signup or first signin when absent. Changeable in settings. |
| Flight path | **Straight line**, point to point. No waypoint routing. |
| Distance | Computed once per user pair, **stored and reused**. Recomputed only when one of them moves. |
| Group send | **One pigeon for the whole group.** Sequential legs, nearest recipient first; the last arrival is the sum of the legs. |
| Flock size | 10 for normal users, 20 for `verified` users. |
| Empty coop | **Hard block** with a countdown to the next returning pigeon. |
| Recall | Allowed mid-flight, with a realistic return leg from wherever the bird is. |
| Map | Inline SVG world map, no tiles, no API key. Endpoints **fuzzed to ~1 km**. |
| No coordinates yet | Cannot send **and cannot receive**. Re-prompted on each visit. |
| In v1 | Unread badge, image attachments, 1:1 and group. |
| Not in v1 | Read receipts, typing indicators. |
| Unfollow | History stays readable; sending blocked. |

### Two blockers to clear first

**Geolocation is disabled app-wide.** `src/hooks.server.ts:15` sends:

```
'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
```

While that stands, `navigator.geolocation` fails silently in the browser. It must become `geolocation=(self)`. This is a required edit, and it is the first thing to change — every other piece of location work is untestable until it lands.

**Exact coordinates plus a map would expose where people live.** Distance uses exact coordinates; the map never does. Every rendered position is snapped to a ~1 km grid (§3). Sender sees the right city and an accurate flight time, never a street address.

### Load-bearing consequence, stated deliberately

Uncapped realism from Phnom Penh, with round-trip occupancy:

| Destination | Distance | Arrival | Pigeon home |
|---|---|---|---|
| Bangkok | ~530 km | 6.6 h | 13 h |
| Tokyo | ~4,350 km | 2.3 d | 4.5 d |
| London | ~9,700 km | 5.0 d | 10 d |
| Lima | ~19,000 km | 10 d | 20 d |

A user with intercontinental friends can ground most of their flock for weeks. That is the intended feel, and one-pigeon-per-group-message softens it. Tuning dials, if testing proves it too harsh: `PIGEON_SPEED_KMH`, the flock constants, a faster empty-bird return — all single constants in `src/lib/pigeon/flight.ts`.

---

## 1. Flight model — `src/lib/pigeon/flight.ts`

Pure functions, no DB, no DOM. Shared by server (computing timestamps) and client (animating). Test this file hardest.

```ts
export const PIGEON_SPEED_KMH = 80;      // homing pigeon cruise
export const EARTH_RADIUS_KM = 6371;
export const FLOCK_SIZE_NORMAL = 10;
export const FLOCK_SIZE_VERIFIED = 20;
export const MAP_FUZZ_KM = 1;
```

### Distance — haversine

```ts
export function haversine_km(a: Coords, b: Coords): number
```

`a = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)`, then `d = 2R · asin(√a)`.

This is the true surface distance and what all timing uses. The map draws a straight line between projected points, which is not the same curve — a deliberate, visible simplification, chosen because a straight flight path is the intended look.

### Route — one pigeon, straight legs

A pigeon carries one message to every recipient in turn, then flies home. Direct messages are a route of length 1, so there is **one** code path.

```ts
export type RouteLeg = { from: Coords; to: Coords; recipient_id: string | null; distance_km: number };
export function plan_route(origin: Coords, recipients: { user_id: string; coords: Coords }[]): RouteLeg[]
```

Greedy nearest-neighbour from the origin: hop to the closest unvisited recipient, repeat, then append a final leg home with `recipient_id: null`. Groups cap at 20, so greedy is right — do not build a TSP solver.

Cumulative distance at the end of leg *i* gives that recipient's arrival:

```
deliver_at[i] = departed_at + (cumulative_km[i] / PIGEON_SPEED_KMH) hours
available_at  = departed_at + (total_route_km / PIGEON_SPEED_KMH) hours   // includes the leg home
```

`available_at` is when the bird is back in the loft and rejoins the flock.

### Position at a moment

```ts
export function position_at(route: RouteLeg[], departed_at: number, now: number): { coords: Coords; leg_index: number; fraction: number }
```

Find the active leg from elapsed distance (`elapsed_hours × speed`), then **linear interpolation** between the leg endpoints:

```
lat = from.lat + (to.lat − from.lat) · f
lng = from.lng + (to.lng − from.lng) · f
```

Straight in lat/lng is straight on the equirectangular projection (§7), so the drawn path and the computed position agree exactly. Handle antimeridian crossings by choosing the shorter direction in longitude (if `|Δlng| > 180`, adjust by ±360 before interpolating and wrap the result) — otherwise a Tokyo → Lima bird flies the long way across the whole map.

### Recall

```ts
export function plan_recall(route: RouteLeg[], departed_at: number, recalled_at: number, origin: Coords):
	{ return_distance_km: number; available_at: number; cancelled_recipient_ids: string[] }
```

The bird turns around from wherever it is: `position_at(...)` gives the point, then a direct line home. Recipients whose `deliver_at` already passed **keep their message** — you cannot unsend what arrived. Everyone downstream is cancelled. Partial group delivery is realistic and worth keeping.

### Map fuzzing — deterministic, never random

```ts
export function fuzz_for_map(coords: Coords): Coords
```

Snap to a ~1 km grid:

```
step_lat = MAP_FUZZ_KM / 110.574
step_lng = MAP_FUZZ_KM / (111.320 · cos(lat))
lat = round(lat / step_lat) · step_lat
lng = round(lng / step_lng) · step_lng
```

**Grid snapping, not a random offset.** A random ±1 km jitter regenerated per request lets a sender collect samples and average them back to the true point. A snapped value never varies, so there is nothing to average. Guard `cos(lat) → 0` near the poles.

Applied server-side, in the response mapper — exact coordinates must never leave the server for another user. The sender's own position may be exact; only other people's are snapped.

### Clock skew

The server sends `server_now` (epoch ms) with every payload carrying flight data. The client computes `offset = server_now − Date.now()` once and adds it to every clock read. Without it, a user whose clock is 10 minutes fast sees pigeons arrive early or hover past their ETA — and a ten-day ETA stays wrong by that offset for ten days.

---

## 2. Flock model

A bird is out while `available_at > now`:

```sql
SELECT COUNT(*) AS in_flight
FROM pigeon_flight
WHERE sender_id = ? AND available_at > ?
```

One index seek on `idx_pigeon_flight_sender_available`. Flock size is derived, not stored — `user.verified` (`schema.ts:30`) picks the constant via `flock_size_for(verified)`.

**Nothing sweeps returned pigeons.** A bird is home the moment `available_at` passes; no row is updated, no job runs. `status` exists only to record `'recalled'`.

**Hard block:** every send calls `assert_pigeon_available(sender_id)`, which throws `error(409, 'no_pigeon_available')` carrying `next_available_at` — the `MIN(available_at)` of that user's in-flight birds — so the UI shows an exact countdown without a second request.

---

## 3. Location capture

### Precision and storage

Store **full-precision** `home_lat` / `home_lng` as `REAL`, plus the accuracy the browser reported. Exactness is the point for distance; §1's `fuzz_for_map` protects the display layer.

Columns as separate `ALTER TABLE` entries in `create_tables_sql`, which `handle_table_creation` tolerates via its "duplicate column" branch (`src/lib/server/db.ts:112`) because `user` already exists in production:

```js
	user_home_lat: `ALTER TABLE user ADD COLUMN home_lat REAL`,
	user_home_lng: `ALTER TABLE user ADD COLUMN home_lng REAL`,
	user_home_accuracy_m: `ALTER TABLE user ADD COLUMN home_accuracy_m REAL`,
	user_home_set_at: `ALTER TABLE user ADD COLUMN home_set_at TEXT`,
```

The existing unused `user.location` column (`schema.ts:25`, written nowhere — `profile/edit/+page.server.ts:88-91` touches only name, username, bio) becomes the optional human-readable label, if you ever reverse-geocode one. Nothing depends on it.

### Capture once, at signup or first signin

Reuse the mechanism already in the app. `src/routes/+layout.server.ts:5` returns `username_required`, and `+layout.svelte` renders a blocking username-lock dialog from it. Add `home_required` the same way:

```sql
SELECT (home_lat IS NULL) AS home_required FROM user WHERE id = ?
```

`+layout.svelte` then renders a `HomeLocationGate.svelte` dialog — same shape as the username lock — which calls `navigator.geolocation.getCurrentPosition` and `POST`s the result to `/api/pigeon/home`. No new plumbing; it rides a pattern that already works.

Trigger conditions:

- New signup → gate appears immediately after the account exists.
- Existing user with `home_lat IS NULL` → gate appears on next signin.
- Prompt is **dismissible**; the account keeps working (feed, posts, profile). Pigeons stay locked.

### Server-side validation

Never trust submitted coordinates. `POST /api/pigeon/home` requires `-90 ≤ lat ≤ 90`, `-180 ≤ lng ≤ 180`, both finite numbers, and rejects `0,0` (the classic "no fix" sentinel). Rate-limit it — this is a write a client controls.

### Denied permission → cannot send *or* receive

A user with `home_lat IS NULL` has no computable distance, so:

- Absent from every friends picker, with an explanatory empty state.
- `POST …/send` → `409 sender_home_unset`.
- Naming them as a recipient → `409 recipient_home_unset`.
- `/messages` shows the location gate instead of the inbox.
- Any `message_delivery` rows that somehow exist stay hidden until coordinates are set — the read query requires the viewer to have coordinates.

Re-prompted on each visit to `/messages`, never nagged elsewhere.

### Changing location in settings

`src/routes/settings/+page.svelte` exists but is currently design-only, with no `+page.server.ts`. Add one with an `update_home` form action that re-runs the browser prompt, revalidates, writes the new coordinates — and **invalidates cached distances** (§4):

```sql
DELETE FROM user_distance WHERE user_a_id = ? OR user_b_id = ?
```

**In-flight pigeons keep their original ETA.** `deliver_at` was written at departure and is never recalculated, so a bird already airborne finishes on its original schedule. This falls out of the schema for free — there is no code to write for it, only code to *not* write. Never add a job that rewrites `deliver_at`.

---

## 4. Schema — `src/lib/server/db/schema.ts`

Add to `create_tables_sql` (:12) after the `notification` entry at :166, parents first. **No `CHECK` constraints** — extending one in SQLite needs a full table rebuild, the trap `notification.type` (:159) already fell into. Validate `kind`, `status`, `media_type`, `role` in TypeScript.

```js
	// Pigeon post - conversations (1:1 and group)
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

	// Distance between a user pair, computed once and reused.
	// Ids are stored sorted so (a,b) and (b,a) are the same row.
	user_distance: `
		CREATE TABLE IF NOT EXISTS user_distance (
			user_a_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			user_b_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			distance_km REAL NOT NULL,
			computed_at TEXT NOT NULL DEFAULT (datetime('now')),
			PRIMARY KEY (user_a_id, user_b_id)
		)
	`,

	// One row per released bird. Occupied while available_at > now.
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

	// Per-recipient arrival. THIS is what makes a message visible.
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

	// Modeled on post_media (schema.ts:86)
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
```

Plus the four `user` `ALTER TABLE` entries from §3.

`route_json` stores the planned legs with **fuzzed** coordinates (`[{lat,lng,recipient_id,distance_km}, …]`) so the client can draw the path without ever receiving exact positions. Written once at departure, never updated. Timing came from exact coordinates before fuzzing, so ETAs stay accurate while the drawing does not leak.

**`conversation` carries no `last_message_*` columns.** "The last message" is now *per viewer* — a bird still over the Andaman Sea is not yet your latest message. Denormalizing would need a write at delivery time, and there is no write at delivery time. §5 handles inbox ordering instead.

### 1:1 dedupe

`conversation.direct_key` = the two user ids sorted and joined; `NULL` for groups — **never `''`**, or every group after the first collides under the unique index. Declared as a **separate unique index, not an inline column constraint**: an inline constraint can only apply at table-creation time, whereas an index can be added to a deployed table.

### Indexes — append to `create_indexes_sql` (:210)

```js
	// Pigeon post indexes
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_direct_key ON conversation(direct_key)`,
	`CREATE INDEX IF NOT EXISTS idx_conversation_participant_user ON conversation_participant(user_id, conversation_id)`,
	`CREATE INDEX IF NOT EXISTS idx_user_distance_b ON user_distance(user_b_id)`,
	`CREATE INDEX IF NOT EXISTS idx_pigeon_flight_sender_available ON pigeon_flight(sender_id, available_at)`,
	`CREATE INDEX IF NOT EXISTS idx_message_conversation_departed ON message(conversation_id, departed_at, id)`,
	`CREATE INDEX IF NOT EXISTS idx_message_delivery_recipient ON message_delivery(recipient_id, deliver_at)`,
	`CREATE INDEX IF NOT EXISTS idx_message_delivery_message ON message_delivery(message_id)`,
	`CREATE INDEX IF NOT EXISTS idx_message_attachment_message ON message_attachment(message_id)`,
```

`idx_message_delivery_recipient` is the workhorse: arrival filter, unread count, inbox ordering, next-arrival lookup. `idx_user_distance_b` makes the `OR user_b_id = ?` half of cache invalidation an index seek rather than a scan (the PK covers `user_a_id`).

### `table_names` (:257)

```js
	conversation: 'conversation',
	conversationParticipant: 'conversation_participant',
	userDistance: 'user_distance',
	pigeonFlight: 'pigeon_flight',
	message: 'message',
	messageDelivery: 'message_delivery',
	messageAttachment: 'message_attachment'
```

---

## 5. Server helpers — new `src/lib/server/pigeon-post.ts`

### Timestamps

```ts
/** 'YYYY-MM-DD HH:MM:SS.mmm' — UTC, no Z, sorts against datetime('now') output. */
export function now_sql_timestamp(): string {
	return new Date().toISOString().replace('T', ' ').replace('Z', '');
}
export function sql_timestamp_from_epoch(ms: number): string
export function epoch_from_sql_timestamp(value: string): number   // appends 'Z' before parsing
```

Millisecond precision is deliberate: it keeps `deliver_at` ordering exact. `last_read_at` **must** use the same helper — mixing in second-precision `datetime('now')` makes a message delivered in that same second permanently unread. Reuse `format_time_ago` (`src/lib/server/profile-helpers.ts:274`) for display rather than writing a third copy (`api/posts/+server.ts:284` is already the second).

### Signatures

```ts
export async function get_mutual_follows(user_id: string, options?: { search?: string; limit?: number }): Promise<PigeonFriend[]>
export async function are_mutual_follows(user_a_id: string, user_b_id: string): Promise<boolean>
export async function filter_mutual_follows(user_id: string, candidate_ids: string[]): Promise<string[]>

export async function get_home_coords(user_id: string): Promise<Coords | null>
export async function get_home_coords_many(user_ids: string[]): Promise<Map<string, Coords>>
export async function set_home_coords(user_id: string, coords: Coords, accuracy_m: number | null): Promise<void>
export async function invalidate_distances_for(user_id: string): Promise<void>

export async function get_pair_distance_km(user_a_id: string, user_b_id: string): Promise<number>       // cached, computes on miss
export async function get_pair_distances_km(user_id: string, other_ids: string[]): Promise<Map<string, number>>

export async function count_pigeons_in_flight(user_id: string): Promise<number>
export async function get_flock_state(user_id: string): Promise<{ size: number; in_flight: number; next_available_at: string | null }>
export async function assert_pigeon_available(user_id: string): Promise<void>   // throws 409 no_pigeon_available

export async function assert_participant(conversation_id: string, user_id: string): Promise<ParticipantRow>
export async function assert_can_send(conversation_id: string, user_id: string): Promise<ParticipantRow>

export async function create_or_get_direct_conversation(user_id: string, other_user_id: string): Promise<{ conversation_id: string; created: boolean }>
export async function create_group_conversation(user_id: string, member_ids: string[], title: string | null): Promise<{ conversation_id: string }>
export async function add_group_members(conversation_id: string, actor_id: string, member_ids: string[]): Promise<string[]>
export async function leave_conversation(conversation_id: string, user_id: string): Promise<void>

export async function release_pigeon(conversation_id: string, sender_id: string, body: string, attachments: PendingAttachment[]): Promise<FlightResult>
export async function recall_pigeon(flight_id: string, sender_id: string): Promise<RecallResult>

export async function list_inbox(user_id: string, limit?: number): Promise<ConversationSummary[]>
export async function count_unread_conversations(user_id: string): Promise<number>
export async function get_next_arrival_at(user_id: string): Promise<string | null>
export async function get_conversation_meta(conversation_id: string, user_id: string): Promise<ConversationMeta | null>
export async function get_thread(conversation_id: string, user_id: string, options?: { before?: string; limit?: number }): Promise<ThreadPage>
export async function mark_conversation_read(conversation_id: string, user_id: string, up_to?: string | null): Promise<void>
```

### Cached pair distance

```ts
export function sort_pair(a: string, b: string): [string, string]   // [min, max]
```

`get_pair_distance_km`:

```sql
SELECT distance_km FROM user_distance WHERE user_a_id = ? AND user_b_id = ? LIMIT 1
```

On a miss: load both users' exact coordinates, `haversine_km`, then

```sql
INSERT INTO user_distance (user_a_id, user_b_id, distance_km, computed_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(user_a_id, user_b_id) DO NOTHING
```

`DO NOTHING` makes concurrent first-sends harmless — both compute the same number anyway. `get_pair_distances_km` does the whole set in one `IN (…)` read plus one batch insert for the misses, so a group send is two round trips regardless of size.

Note plainly: this cache saves no measurable time. Haversine is ~10 float ops with no I/O; the round trip to read the cached value costs more than recomputing it. It is here because a stored distance is *stable* — it cannot drift if the maths or the constants change, and a bird's quoted distance stays the number it was quoted. Treat durability as the reason, not speed.

Invalidation is the correctness-critical half. `set_home_coords` and `invalidate_distances_for` must always run together, in one batch:

```sql
DELETE FROM user_distance WHERE user_a_id = ? OR user_b_id = ?
```

Miss this and a user who moves keeps their old flight times forever.

### Mutual-follow SQL — self-JOIN, INNER, AND semantics

Genuinely new; nothing in the codebase does this. **Do not copy `build_post_visibility_clause`** (`src/lib/server/post-visibility.ts:14-45`) — it uses `EXISTS(...) OR EXISTS(...)`, the wrong operator for "friends".

```sql
SELECT u.id, u.name, u.username, u.image, u.verified
FROM follow f_out
JOIN follow f_in
  ON f_in.follower_id = f_out.following_id
 AND f_in.following_id = f_out.follower_id
JOIN user u ON u.id = f_out.following_id
WHERE f_out.follower_id = ?
  AND u.home_lat IS NOT NULL
ORDER BY u.name COLLATE NOCASE ASC
LIMIT ?
```

`f_out` rides `idx_follow_follower` (:238); `f_in` is an exact two-column match served by the `UNIQUE(follower_id, following_id)` autoindex (:150). `home_lat IS NOT NULL` implements "cannot receive without coordinates". The endpoint then attaches each friend's cached distance and derived flight time via `get_pair_distances_km`, so the picker shows the cost of a send **before** you spend a bird. Only distance and duration cross the wire — never coordinates.

`are_mutual_follows` and `filter_mutual_follows` are the same join narrowed to a boolean and to a parameterised `IN` list. `filter_mutual_follows` compares returned set to requested set and rejects the whole request if any id is missing — never silently drops group members.

### `release_pigeon` — the core write

```ts
// 1. guards, cheapest first
await assert_can_send(conversation_id, sender_id);        // participant + direct mutual-follow gate
await assert_pigeon_available(sender_id);                  // 409 no_pigeon_available + next_available_at
const origin = await get_home_coords(sender_id);           // 409 sender_home_unset if null

// 2. recipients = participants minus sender, exact coords
const coords = await get_home_coords_many(recipient_ids);  // 409 recipient_home_unset, naming who is missing

// 3. plan the flight — pure, no DB, exact coordinates
const route = plan_route(origin, recipients);
const departed = Date.now();
const total_km = route.reduce((sum, leg) => sum + leg.distance_km, 0);
const available_at = departed + (total_km / PIGEON_SPEED_KMH) * 3_600_000;

// 4. persist cached pair distances for the legs that touch the sender
// 5. one atomic batch: pigeon_flight (route_json FUZZED), message,
//    one message_delivery per recipient, attachments, sender's own last_read_at
await db.batch([...], 'write');
```

Returns the flight — fuzzed route, per-recipient ETAs, `available_at`, `server_now` — with **no read-back query**. Safe in a batch because every value is computed in JS first.

The flock check is **not race-proof**: two simultaneous requests can both see 9 birds out and both send. Overrun is bounded at one bird and self-corrects. Do not add a counter column or a lock — the cure is worse than the disease.

### `recall_pigeon`

Verify `sender_id` owns the flight and `status = 'in_flight'`. Call `plan_recall(...)`, then one batch: soft-cancel still-airborne deliveries (`UPDATE message_delivery SET cancelled_at = ? WHERE message_id = ? AND deliver_at > ? AND cancelled_at IS NULL`), set `status = 'recalled'`, `recalled_at`, and the shortened `available_at`. If every delivery already landed → `409 nothing_to_recall`.

### Read path — arrival is a JOIN condition

`get_thread` for a **recipient**:

```sql
SELECT m.id, m.sender_id, m.body, m.attachment_count, md.deliver_at,
       u.name AS sender_name, u.username AS sender_handle,
       u.image AS sender_avatar, u.verified AS sender_verified
FROM message_delivery md
JOIN message m ON m.id = md.message_id
JOIN user u ON u.id = m.sender_id
WHERE md.recipient_id = ?
  AND m.conversation_id = ?
  AND md.cancelled_at IS NULL
  AND md.deliver_at <= ?
  AND m.deleted_at IS NULL
ORDER BY md.deliver_at DESC
LIMIT ?
```

The `deliver_at <= ?` predicate **is** the delivery mechanism; `?` is `now_sql_timestamp()` per request.

The **sender's** own messages are visible immediately with flight state, so a thread is the union of that query plus the sender's own `message` rows joined to `pigeon_flight`. Sender rows carry `route_json`, `departed_at`, and per-recipient `deliver_at` for the map; recipient rows carry none of it — a recipient must not learn that a bird is en route.

### Inbox ordering without denormalization

```sql
SELECT c.id, c.kind, c.title,
       (SELECT MAX(md.deliver_at) FROM message_delivery md
        JOIN message m2 ON m2.id = md.message_id
        WHERE m2.conversation_id = c.id AND md.recipient_id = ?
          AND md.cancelled_at IS NULL AND md.deliver_at <= ?) AS last_delivered_at,
       (SELECT COUNT(*) FROM message_delivery md
        JOIN message m3 ON m3.id = md.message_id
        WHERE m3.conversation_id = c.id AND md.recipient_id = ?
          AND md.cancelled_at IS NULL AND md.deliver_at <= ?
          AND (cp.last_read_at IS NULL OR md.deliver_at > cp.last_read_at)) AS unread_count
FROM conversation_participant cp
JOIN conversation c ON c.id = cp.conversation_id
WHERE cp.user_id = ? AND cp.left_at IS NULL
ORDER BY last_delivered_at DESC NULLS LAST
LIMIT ?
```

Two correlated subqueries per conversation looks expensive and isn't: both ride `idx_message_delivery_recipient`, and the flock cap bounds how many rows can exist. A second query fetches the newest delivered body per conversation for previews, plus participant profiles via one `IN (…)`.

### `get_next_arrival_at` — why polling disappears

```sql
SELECT MIN(md.deliver_at) AS next_arrival_at
FROM message_delivery md
WHERE md.recipient_id = ? AND md.cancelled_at IS NULL AND md.deliver_at > ?
```

Returned with every `/messages` load. The client sets **one** `setTimeout` for that moment and refreshes then. No interval, no ladder, no backoff.

Use it to schedule only — **never render it.** Showing "a pigeon arrives in 3 days" spoils arrival and leaks that someone is writing to you.

### Unread badge

```sql
SELECT COUNT(DISTINCT m.conversation_id) AS unread_conversations
FROM message_delivery md
JOIN message m ON m.id = md.message_id
JOIN conversation_participant cp
  ON cp.conversation_id = m.conversation_id AND cp.user_id = md.recipient_id
WHERE md.recipient_id = ?
  AND md.cancelled_at IS NULL
  AND md.deliver_at <= ?
  AND cp.left_at IS NULL
  AND (cp.last_read_at IS NULL OR md.deliver_at > cp.last_read_at)
```

Counts conversations, not messages — bounded by conversations the user is in.

### `mark_conversation_read` — monotonic

```sql
UPDATE conversation_participant SET last_read_at = ?
WHERE conversation_id = ? AND user_id = ? AND (last_read_at IS NULL OR last_read_at < ?)
```

`up_to` clamped to now. Never moves backwards.

---

## 6. API endpoints

All under `/api/pigeon/`. House pattern: `auth.api.getSession({ headers: request.headers })` → 401 (see `src/routes/api/users/follow/[handle]/+server.ts:11-19`), `// eslint-disable-next-line @typescript-eslint/naming-convention` above each uppercase export, `try/catch` → `console.error('[PIGEON API] …')` → 500.

| Method + path | Request | Response | Errors |
|---|---|---|---|
| `POST /api/pigeon/home` | `{ lat, lng, accuracy_m? }` | `{ success, distances_invalidated }` | 400 invalid coords; 401; 429 |
| `GET /api/pigeon/friends` | `?q=&limit=` | `{ friends: [{ …, distance_km, flight_ms }] }` | 401 |
| `GET /api/pigeon/flock` | — | `{ size, in_flight, next_available_at, flights }` | 401 |
| `GET /api/pigeon/conversations` | `?limit=30` | `{ conversations, unread_conversations, next_arrival_at, server_now }` | 401 |
| `POST /api/pigeon/conversations` | `{ kind:'direct', user_id \| handle }` \| `{ kind:'group', member_ids[], title? }` | `{ conversation_id, created }` | 400; 403 `not_mutual_follow`; 404; 409 group size / `recipient_home_unset` |
| `GET /api/pigeon/conversations/[id]` | `?before=&limit=30` | `{ conversation, messages, flights, has_more, server_now }` | 401, 403, 404 |
| `POST /api/pigeon/conversations/[id]/send` | `{ body, attachments?, client_temp_id? }` | `201 { message, flight, server_now }` | 400; 403 `not_mutual_follow`; **409 `no_pigeon_available`** (+`next_available_at`), `sender_home_unset`, `recipient_home_unset`; 429 |
| `POST /api/pigeon/conversations/[id]/read` | `{ up_to? }` | `{ success, unread_conversations }` | 401, 403 |
| `POST /api/pigeon/flights/[id]/recall` | — | `{ flight, cancelled_recipient_ids }` | 401, 403 not owner, 409 `nothing_to_recall` |
| `POST /api/pigeon/conversations/[id]/members` | `{ member_ids[] }` | `{ added }` | 400; 403 not owner / not a group; 409 size |
| `DELETE /api/pigeon/conversations/[id]/members` | — (leave) | `{ success }` | 401, 403 |
| `GET /api/pigeon/unread-count` | — | `{ unread_conversations, next_arrival_at }` | 401 |
| `POST /api/pigeon/attachment` | `multipart/form-data { file }` | `{ url, key, media_type, byte_size }` | 400, 401, 413, 429 |

Files under `src/routes/api/pigeon/…`. SvelteKit resolves static segments before dynamic ones, so `home`, `friends`, `flock`, `unread-count`, `attachment` never shadow `[id]`.

**No endpoint ever returns another user's exact coordinates.** Everything user-facing carries derived distance, flight time, or grid-snapped positions.

**Friends: new endpoint, do not reuse `/api/users/following`.** That route returns *one-directional* follows — wrong semantics — is already consumed by `PostTextbox.svelte:219` for close-friends selection, and strips `verified` at :20-26.

**Send validation:** normalize `\r\n` → `\n` and collapse 3+ blank lines (copy `normalize_post_content`, `api/posts/+server.ts:20-22`); reject when the trimmed body is empty **and** there are no attachments; body ≤ 2000 chars; ≤ 4 attachments; each `url` must match `^https://res\.cloudinary\.com/`; each `key` must start with `pigeon/messages/<sender_id>/` — the check that stops a client attaching a URL it never uploaded.

**Rate limiters** — add to `src/lib/server/rate-limiter.ts:66-71`:

```ts
export const pigeon_release_limiter = new RateLimiter();      // check(user_id, 5, 10_000)
export const pigeon_home_limiter = new RateLimiter();         // check(user_id, 5, 60_000)
export const conversation_create_limiter = new RateLimiter();  // check(user_id, 10, 60_000)
export const pigeon_attachment_limiter = new RateLimiter();    // check(user_id, 20, 60_000)
```

The flock is the real spam control; these blunt scripted abuse only. They are per-serverless-instance and must never be relied on for anything security-relevant.

---

## 7. The map — `src/lib/components/pigeon/FlightMap.svelte`

**Inline SVG, equirectangular (plate carrée) projection.** Bundle a world-outline SVG at `src/lib/assets/world-equirectangular.svg` with a 2:1 viewBox (e.g. `0 0 1000 500`).

The projection must match the asset or every pigeon lands in the sea:

```ts
export function project(coords: Coords, width: number, height: number) {
	return { x: ((coords.lng + 180) / 360) * width, y: ((90 - coords.lat) / 180) * height };
}
```

A Mercator asset needs a different `y`, so verify the asset before drawing anything. Sanity-check with a known point: Phnom Penh (11.55 N, 104.92 E) must land on Cambodia.

Rendering:

- **Route path**: one straight `<line>` (or `<path>` with `L`) per leg between projected fuzzed endpoints. Straight in lat/lng is straight on this projection, so the drawn line and `position_at` agree exactly.
- **Antimeridian**: a leg crossing ±180° must be drawn as two segments, or it streaks across the whole map. Split at the boundary using the same shorter-direction logic as `position_at`.
- **Flown vs. remaining**: solid stroke up to the bird, dashed ahead of it.
- **Pigeon marker**: `<g>` translated to the current projected position, rotated to the segment angle.
- **Endpoints**: small loft markers, labelled with an approximate place name only — never coordinates.
- **Animation**: one `requestAnimationFrame` loop while mounted, recomputing from `Date.now() + clock_offset`, cancelled in the `$effect` teardown.
- **Reduced motion**: honour `prefers-reduced-motion` with a static position and no rAF loop.
- **Zoom**: fit the viewBox to the route's bounding box plus padding, so a Phnom Penh → Bangkok hop isn't an invisible dot on a world map.

A ten-day flight moves a few pixels an hour, so the marker will read as static. Ship the numeric ETA and a progress percentage alongside — the marker carries the charm, the readout carries the information.

No tiles, no key, no per-load billing, works offline.

---

## 8. UI

### Routes

```
src/routes/messages/+layout.server.ts                  inbox + unread + next_arrival_at + flock + server_now
src/routes/messages/+layout.svelte                     two-pane shell; conversation list; flock indicator; arrival timer
src/routes/messages/+page.svelte                       desktop: "choose a loft"; mobile: nothing
src/routes/messages/[conversation_id]/+page.server.ts   get_conversation_meta + get_thread + mark_conversation_read
src/routes/messages/[conversation_id]/+page.svelte      thread + in-flight strip + composer
src/routes/messages/flock/+page.svelte                 the loft: every bird, where it is, recall buttons
src/routes/settings/+page.server.ts                    NEW — update_home action (page exists, has no server file)
```

`hooks.server.ts:120` already redirects unauthenticated users away from anything outside `{ /, /signup, /api/auth/*, /credits }`, so `/messages` is protected for free.

### Components — `src/lib/components/pigeon/`

| File | Copies from |
|---|---|
| `HomeLocationGate.svelte` | The username-lock dialog in `src/routes/+layout.svelte` — same blocking-panel shape, driven by a new `home_required` flag from `+layout.server.ts`. Calls `navigator.geolocation.getCurrentPosition`, POSTs to `/api/pigeon/home`, handles denial and timeout with distinct copy. |
| `ConversationList.svelte` | Row markup from `profile/ProfileConnectionsModal.svelte:55-79` — avatar `<img>` with `/default-avatar.svg` fallback, name, `BadgeCheck size={16} fill="#0ea5e9" color="white"`, `@handle` — plus preview, `format_time_ago` stamp, unread pill from `.notify-count` (`styles/navbar.css:196-216`). |
| `FlightMap.svelte` | New. §7. |
| `InFlightCard.svelte` | New. Destination, ETA countdown, distance, recall button. Opens `FlightMap` in a modal. |
| `FlockIndicator.svelte` | New. "7 / 10 pigeons in the loft" plus the next-return countdown when empty. |
| `MessageBubble.svelte` | Avatar + time row from `NotificationCard.svelte:212`. Own bubble `#0ea5e9`/white, other `#f1f5f9`/`#0f172a`, radius 16px. |
| `PigeonComposer.svelte` | Auto-grow textarea, char counter, disabled-while-sending, error handling from `PostTextbox.svelte`. Owns all four disabled states. Shows distance and flight time before sending. |
| `AttachmentPicker.svelte` | Compression + upload flow from `AvatarUploader.svelte:87-160`. |
| `NewFlightModal.svelte` | Modal shell (backdrop, `role="dialog" aria-modal`, Escape, `on_close` callback prop) from `ProfileConnectionsModal.svelte:27-49`, or the `fade`/`scale` variant in `PostModal.svelte:54-64`. Direct/Group tabs, `/api/pigeon/friends`, debounced `?q=` like `Navbar.svelte:92-98`, each friend showing distance and flight time. |
| `src/lib/components/styles/pigeon.css` | Follows the `navbar.css` / `sidebar.css` / `bottom-nav.css` precedent: semantic BEM-ish classes, hardcoded palette (`#0ea5e9`, `#0f172a`, `#475569`, `#64748b`, `#cbd5e1`, `#f1f5f9`, `#f8fbff`), 999px pills, 16px cards, 900px/640px breakpoints, `lucide-svelte` icons. No Tailwind utilities. |

Svelte 5 runes throughout (forced by `svelte.config.js` `dynamicCompileOptions`): `$state`, `$derived`, `$derived.by`, `$effect`, callback props, `page` from `$app/state`, `resolve()` from `$app/paths`.

### Composer states

Where the concept becomes felt, so all four need real copy, not a generic toast:

1. **Ready** — "Bangkok · 530 km · arrives in about 7 hours", under the textarea, before you send.
2. **No pigeon** — disabled, "All 10 pigeons are out. The next one lands in 4h 12m." Countdown ticks locally off `next_available_at`.
3. **No location** — disabled, opens `HomeLocationGate`.
4. **No longer friends** — disabled, "You can only send pigeons to people who follow you back." History stays readable. Derive from `get_conversation_meta`'s `can_send` so it starts disabled rather than failing on first send.

### Timers instead of polling

`src/lib/pigeon/arrival-timer.svelte.ts` owns exactly one `setTimeout`, set to `next_arrival_at` (clock-corrected). On fire: `invalidateAll()`, then reschedule from the fresh value. Plus a refresh on `visibilitychange` → visible, covering a laptop asleep through an arrival.

The unread badge reads the same store — no separate poller. Mirror the existing `notifications-seen-updated` window-event pattern (`Navbar.svelte:116,130`) with a `pigeon-arrived` event so layout, badge, and thread react to one signal.

### Navigation

**`Sidebar.svelte`**: widen the `AppRoute` union at :9 with `'/messages'`; add `{ label: 'Pigeons', icon: Send, href: '/messages' }` to `nav_items` (:45-55) between Notifications and Profile; add `path === '/messages' || path.startsWith('/messages/')` to `is_main_path()` (:13-22); badge inside the `{#each}` at :247 keyed on `item.href === '/messages'` (keying off `href` avoids widening the `as const satisfies` tuple type). New `.nav-badge` rule in `styles/sidebar.css` copying `.notify-count`.

**`BottomNav.svelte`**: replace `About` (`/credits`) with Pigeons — About stays reachable from the sidebar. Badge span plus `.bottom-nav-badge` in `styles/bottom-nav.css`.

Do **not** add a Navbar icon; it already carries Bell + avatar.

### Mobile at 900px

`.page-content--flush` exists at `layout.css:39-41` but nothing applies it. Add `class:page-content--flush={page.url.pathname.startsWith('/messages')}` to `<main class="page-content">` in `src/routes/+layout.svelte:108` — one line, and it finally uses the class written for this. Otherwise the pane fights 1.5rem of padding plus `padding-bottom: 80px !important` from `bottom-nav.css:60-66`.

- **≥901px**: grid `320px 1fr`, list always visible, active row via `page.params.conversation_id`.
- **≤900px**: single pane. `const is_thread_open = $derived(page.url.pathname !== '/messages')`. Thread header gets an `ArrowLeft` back link to `resolve('/messages')`, same affordance as `Sidebar.svelte:234-243`.
- Composer `position: sticky; bottom: 0`, `padding-bottom: env(safe-area-inset-bottom)` (matching `bottom-nav.css:15`).
- `FlightMap` full-width above the thread on mobile, collapsible.

### Attachments

`POST /api/pigeon/attachment`, structured on `src/routes/api/upload-avatar/+server.ts:44-103`. Two edits to `src/lib/server/cloudinary.ts`: add an optional `resource_type: 'image' | 'raw' | 'auto' = 'image'` parameter to the private `upload_buffer` (:43), applying the `transformation` array only when `'image'`; export `upload_message_attachment(user_id, buffer)` using folder `pigeon/messages/${user_id}` with public_id `msg_${Date.now()}_${nanoid(8)}` — collision-proof, unlike `upload_post_media`'s `post_${Date.now()}` with `overwrite: true`. The folder prefix makes the ownership check on send possible.

Client-side, mirroring `AvatarUploader.svelte:87-131`: images only (`jpeg`/`png`/`webp`/`gif`), max 4, reject >10MB pre-compression, `imageCompression` above 500KB (GIFs skip it — compression flattens animation), `URL.createObjectURL` thumbnails revoked on unmount, upload immediately rather than on send, send disabled while any upload is in flight.

`message_attachment` rows are written by `release_pigeon`, **not** the upload endpoint — same separation as `api/posts/+server.ts:141-151`. An abandoned upload orphans a Cloudinary asset but never a DB row; `delete_from_cloudinary` (`cloudinary.ts:152`) exists for a future sweep.

---

## 9. Implementation order

1. **Unblock geolocation.** Change `Permissions-Policy` to `geolocation=(self)` in `src/hooks.server.ts:15`. Verify `navigator.geolocation.getCurrentPosition` actually resolves in the browser. Nothing else is testable until this lands.
2. **`src/lib/pigeon/flight.ts` + tests.** Pure math: haversine, `plan_route`, `position_at` (with antimeridian handling), `plan_recall`, `fuzz_for_map`, `project`, `flock_size_for`. Fully testable before any schema exists. **Start the real work here** — everything downstream depends on these numbers.
3. **Schema.** 6 tables + 4 `user` `ALTER TABLE` entries + 8 indexes + `table_names`. Verify DDL against a scratch DB before committing (§11 risk 1).
4. **Location capture.** `POST /api/pigeon/home`, `set_home_coords` + `invalidate_distances_for`, `home_required` in `+layout.server.ts`, `HomeLocationGate.svelte` wired into `+layout.svelte`. Ship alone — independently verifiable and unblocks everything after.
5. **Settings change flow.** New `src/routes/settings/+page.server.ts` with `update_home`, reusing the same gate component. Confirm `user_distance` rows for that user disappear.
6. **`pigeon-post.ts` foundations.** Timestamps, mutual-follow queries, `get_home_coords*`, `sort_pair`, `get_pair_distance*`, flock helpers, `assert_participant`, `assert_can_send`. Tests alongside.
7. **Conversation lifecycle.** `create_or_get_direct_conversation`, `create_group_conversation`, `GET /api/pigeon/friends`, `GET|POST /api/pigeon/conversations`. Confirm both users starting a chat produce exactly one `conversation` row.
8. **Release and read.** `release_pigeon`, `get_thread`, `list_inbox`, `count_unread_conversations`, `get_next_arrival_at`, `mark_conversation_read`, and their endpoints. **Test with an inflated `PIGEON_SPEED_KMH`** so flights land in seconds.
9. **Inbox UI.** `pigeon.css`, `ConversationList.svelte`, `/messages/+layout.*`, `/messages/+page.svelte`, the `page-content--flush` one-liner.
10. **Thread UI.** `MessageBubble.svelte`, `PigeonComposer.svelte` with all four states, `InFlightCard.svelte` with a text ETA only. No map yet — prove timing first.
11. **`FlightMap.svelte`.** Projection sanity-check against known cities, then the straight legs, then antimeridian splitting, then the marker, then the rAF loop.
12. **Flock page and recall.** `/messages/flock`, `FlockIndicator.svelte`, `POST /api/pigeon/flights/[id]/recall`.
13. **Arrival timer + badge.** `arrival-timer.svelte.ts`, `Sidebar.svelte`, `BottomNav.svelte`, the two CSS badge rules.
14. **Groups and attachments.** `NewFlightModal.svelte` group tab, `POST|DELETE .../members`, then `cloudinary.ts` edits, upload endpoint, `AttachmentPicker.svelte`, attachment rendering.
15. **Polish.** Empty states, `Toast.svelte` errors, reduced-motion, 900px panes, arrival transition, day dividers.

Steps 1-8 ship behind no UI. Steps 9-10 give a working pigeon post with a text ETA. Step 11 is where it becomes the thing you described.

---

## 10. Verification

```
pnpm check                 # svelte-kit sync + svelte-check
pnpm lint                  # prettier --check . && eslint .
pnpm test:unit -- --run    # both vitest projects
pnpm test:e2e              # playwright
```

`pnpm check` must run after adding routes — `resolve('/messages')` won't typecheck until `svelte-kit sync` regenerates route types, and `svelte-check` already has pre-existing `resolve()` route-union errors, so compare against the baseline rather than expecting zero output. `pnpm lint` flags any non-snake_case variable or function via `eslint_rules/naming-convention.ts`; every uppercase HTTP export needs its eslint-disable comment.

### Tests to add

**Pure flight math** — `src/lib/pigeon/flight.test.ts` (node project). Highest-value tests in the feature:

- `haversine_km` against known pairs: Phnom Penh→Bangkok ≈ 530 km, Phnom Penh→Tokyo ≈ 4,350 km, London→New York ≈ 5,570 km (±1%).
- Identical coordinates → 0 km, and `position_at` returns no `NaN`.
- Antipodal points ≈ 20,015 km.
- **Antimeridian**: Tokyo (139.7 E) → Honolulu (157.9 W) computes ≈ 6,200 km, not the long way, and `position_at` midway lands in the Pacific rather than over Africa. The single most likely source of a visibly broken flight.
- `plan_route` with 3 recipients visits nearest first, ends with a `recipient_id: null` leg home, and `Σ leg.distance_km === total`.
- Cumulative arrivals strictly increasing; `available_at > max(deliver_at)`.
- `position_at(route, t0, t0)` === origin; at `available_at` === origin again; at a leg boundary === that recipient's coordinates.
- `fuzz_for_map` is **idempotent and stable**: same input → identical output across 1,000 calls; output within 1.5 km of input; two inputs 100 m apart usually snap to the same cell. This is the test that proves averaging cannot recover a true position.
- `project` maps (0,0) to the viewBox centre and (11.55, 104.92) into the expected quadrant.
- `flock_size_for(false) === 10`, `flock_size_for(true) === 20`.
- `PIGEON_SPEED_KMH === 80` — the guard that stops a dev-testing value shipping.

**Server** — `src/lib/server/pigeon-post.test.ts`. Mock with `vi.mock('$lib/server/db', () => ({ db: { execute: mock_execute, batch: mock_batch } }))` **before** a dynamic `await import('./pigeon-post')`, following the mock-then-import discipline of `src/server/server.test.ts:8-24`; mocking `$lib/server/db` rather than `@libsql/client` sidesteps `$env/dynamic/private`.

- `sort_pair(a, b)` === `sort_pair(b, a)`, and `build_direct_key` likewise — the dedupe and the distance cache both rest on this.
- `now_sql_timestamp()` matches `/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/` with no `Z`; `epoch_from_sql_timestamp(now_sql_timestamp())` round-trips within 1 ms.
- `get_pair_distance_km` on a cache hit performs **exactly one** query and never touches coordinates.
- `set_home_coords` always issues the `DELETE FROM user_distance … OR user_b_id = ?` in the same batch — the invalidation-is-not-optional test.
- `get_mutual_follows` SQL contains `JOIN follow` twice, contains **no** ` OR `, and includes `home_lat IS NOT NULL`.
- `assert_pigeon_available` throws 409 at the flock size, and the error carries `next_available_at`.
- `release_pigeon` calls `db.batch` exactly once; inserts one `pigeon_flight`, one `message`, one `message_delivery` per recipient; and the persisted `route_json` contains **fuzzed** coordinates, not the exact ones used for timing.
- `get_thread` SQL for a recipient includes `md.deliver_at <= ?`.
- `assert_can_send` throws `not_mutual_follow` for a direct conversation when the mutual probe is empty, and does **not** probe for `kind = 'group'`.
- `mark_conversation_read` SQL includes the `last_read_at < ?` monotonic guard.

**Component** (browser project, following `src/lib/vitest-examples/Welcome.svelte.spec.ts`):

- `FlightMap.svelte.spec.ts` — one segment per leg; marker at origin when `now === departed_at`; a ±180°-crossing leg renders two segments; no rAF loop under `prefers-reduced-motion`.
- `PigeonComposer.svelte.spec.ts` — correct copy in each of the four disabled states; no read-receipt or typing-indicator element exists (locks in the explicit non-requirement).

**Playwright** — `src/routes/messages/messages.e2e.ts`: unauthenticated `/messages` redirects to `/` (exercises `hooks.server.ts:120`). The suite has no auth fixture, so keep e2e scope here and do two-user flows manually.

`vite.config.ts:10` sets `expect: { requireAssertions: true }` — every `it()` must assert.

### Manual, end to end

Set `PIGEON_SPEED_KMH` absurdly high (e.g. 500,000) in dev so flights land in seconds. **Restore it before committing** — the unit test in §10 is the backstop, but check anyway.

1. **Geolocation actually works.** In DevTools → Network → response headers, confirm `Permissions-Policy` now reads `geolocation=(self)`. Then confirm the browser prompt appears. If the header is stale, everything below fails confusingly.
2. Schema landed — catches silently-swallowed index failures:
   ```sql
   SELECT type, name FROM sqlite_master
   WHERE name IN ('conversation','conversation_participant','user_distance','pigeon_flight',
                  'message','message_delivery','message_attachment',
                  'idx_conversation_direct_key','idx_message_delivery_recipient',
                  'idx_pigeon_flight_sender_available','idx_user_distance_b');
   ```
   Expect all 11. Also `PRAGMA table_info(user);` must show `home_lat`, `home_lng`, `home_accuracy_m`, `home_set_at`.
3. `EXPLAIN QUERY PLAN` the recipient thread query — `SEARCH message_delivery USING INDEX idx_message_delivery_recipient`, not `SCAN`.
4. New signup → location gate appears. **Deny** it: account works (feed, posts, profile), `/messages` shows the gate, and the user is absent from other people's friends pickers. Grant it later → coordinates saved, pigeons unlock.
5. Two accounts A and B, mutual follow, both with coordinates. B's picker shows A's real distance and flight time **before** sending.
6. First send creates exactly one `user_distance` row:
   ```sql
   SELECT * FROM user_distance;
   ```
   Second send between the same pair adds none, and `get_pair_distance_km` issues one query (check the dev log or a temporary counter).
7. A sends. A sees the bird with a map and ETA; **B sees nothing at all** — no conversation, no badge, no hint. Verify: `SELECT recipient_id, deliver_at FROM message_delivery WHERE message_id = '<id>';`
8. At dev speed: the message appears for B with no page action, driven by the arrival timer. Badge increments. Opening the thread clears it from the `read` response, not a poll.
9. **Network tab during a flight: zero requests.** One request fires at the arrival timestamp. This is the property the whole design rests on — an interval here means something regressed.
10. **Coordinates never leak.** Search every `/api/pigeon/*` response body for the sender's exact latitude. It must appear nowhere. `route_json` in a flight payload must contain grid-snapped values only, and repeated loads must return byte-identical coordinates (proving the fuzz is deterministic).
11. Change location in settings → `user_distance` rows for that user vanish; the next send quotes a new distance; **a bird already airborne keeps its original ETA** and lands on its original schedule.
12. Flock: send 10, confirm the 11th returns 409 `no_pigeon_available` with a correct `next_available_at` and the composer shows the countdown. When the first bird's `available_at` passes, sending works again with no write having occurred.
13. Verified user gets 20 — flip `user.verified` and confirm.
14. Group of 3 across three cities: **one** `pigeon_flight` row, three `message_delivery` rows with strictly increasing `deliver_at`, nearest first, `available_at` covering the leg home.
15. Recall mid-flight: undelivered recipients get `cancelled_at` and never see it; already-delivered keep theirs; `available_at` shortens; a second recall returns 409 `nothing_to_recall`.
16. Dedupe — must return zero rows:
    ```sql
    SELECT direct_key, COUNT(*) FROM conversation
    WHERE direct_key IS NOT NULL GROUP BY direct_key HAVING COUNT(*) > 1;
    ```
17. Map: Phnom Penh renders on Cambodia, not the ocean. Legs are straight. A Tokyo → Honolulu route does **not** streak across the map. Marker advances. `prefers-reduced-motion` stops the loop.
18. Set the OS clock 10 minutes fast → ETAs stay correct.
19. Break the mutual follow → both keep full history; composer disabled with the notice; a forced POST returns 403. Re-follow → sending works.
20. At 900px: list-only at `/messages`, thread-only at `/messages/<id>`, back arrow works, composer above the bottom nav, no double scrollbar, no 80px dead space.

---

## 11. Risks and gotchas

1. **A bad `CREATE TABLE` breaks the whole app.** `handle_table_creation` (`src/lib/server/db.ts:99-121`) swallows *only* "already exists" and "duplicate column" (:112); anything else rethrows out of `ensure_schema`, and `init_promise` (:55-57) caches the **rejected** promise for the instance's lifetime, so every later request re-awaits the same rejection. `hooks.server.ts:79-82` catches and logs, so requests still serve — but every pigeon query then fails with "no such table". Run all DDL against a scratch DB first, and verify the four `user` `ALTER TABLE` entries are idempotent across two consecutive boots.
2. **Index failures are completely silent.** `handle_index_creation` (`db.ts:123-133`) only `console.error`s, never rethrows. Lose `idx_conversation_direct_key` and 1:1 dedupe silently dies; lose `idx_message_delivery_recipient` and every inbox load starts scanning. Hence the explicit `sqlite_master` check.
3. **The `Permissions-Policy` edit is easy to forget and fails silently.** With `geolocation=()` in place the browser API rejects without a visible cause, and it looks like a broken gate component rather than a header. Change it first, verify it in response headers, and add it to the PR description so it isn't reverted by a later security-header cleanup.
4. **Never fuzz randomly.** A per-request random offset lets a sender average samples back to a true position. Grid snapping is stable by construction. If someone "improves" the fuzz into `Math.random()`, the privacy property is gone and nothing visibly breaks — which is why there is a stability test.
5. **Fuzz on the way out, not on the way in.** Exact coordinates must reach the DB (distance depends on them) and must never reach another user. The boundary is the response mapper. A single endpoint that returns a raw `user` row leaks everything — never `SELECT *` from `user` into a payload.
6. **Distance cache invalidation is not optional.** Miss the `DELETE FROM user_distance … OR user_b_id = ?` on a location change and users who move keep old flight times forever, with no error and no symptom except wrong ETAs. `set_home_coords` and `invalidate_distances_for` should be one function that cannot be called halfway.
7. **In-flight pigeons must keep their original ETA.** This works because `deliver_at` is written once at departure. It is a property of *not* writing code — never add a job that recalculates `deliver_at` for airborne birds.
8. **A test-speed `PIGEON_SPEED_KMH` reaching production destroys the product.** The constant is the entire feature. The `=== 80` unit test is the guard; keep it.
9. **Antimeridian bugs are the most likely visible breakage.** Naive longitude interpolation sends a Tokyo → Honolulu bird the wrong way round the world, and a naive `<line>` streaks across the whole map. Handle it in both `position_at` and the renderer, and test both.
10. **Timestamp format consistency is the sharpest correctness edge.** Everything writing these tables uses `now_sql_timestamp()` / `sql_timestamp_from_epoch()`. Mixing second-precision `datetime('now')` into `last_read_at` while `deliver_at` carries milliseconds makes a message delivered in that same second permanently unread. Never use `datetime('now')` inside a `db.batch` — statements can disagree. Always append `'Z'` before `new Date()`.
11. **Clock skew is user-visible here in a way it never is in chat.** A ten-day ETA computed against a wrong local clock stays wrong by that offset for ten days. Always correct against `server_now`.
12. **Projection mismatch puts pigeons in the ocean.** `project` must match the bundled SVG. Equirectangular is assumed; a Mercator asset needs a different `y`. Verify with a known city before drawing anything else.
13. **Never render `next_arrival_at`.** It's a scheduling value. Showing it tells a recipient someone is writing to them, which spoils arrival and leaks more than it appears to.
14. **The flock check is not race-proof.** Two concurrent sends can both see 9 birds out. Overrun is bounded at one bird and self-corrects. Do not add a counter column or a lock.
15. **`direct_key` must be `NULL` for groups, never `''`** — an empty string makes every group collide under the unique index, surfacing on the second group ever created.
16. **`db.batch` is not a transaction around a read.** libSQL batches are atomic across their statements; `release_pigeon` is safe only because every value is computed in JS before the batch. Never add a read-then-write pair into it.
17. **Nothing sweeps returned pigeons, by design.** Availability is `available_at > now`, evaluated per query. Resist adding a cron to "mark birds home" — pure cost, zero behaviour change.
18. **Inbox uses correlated subqueries** because per-viewer delivery makes denormalized `last_message_*` columns impossible. They're cheap *because* the flock caps volume. If you raise flock sizes substantially, re-measure this query first.
19. **Group sends need every recipient to have coordinates**, or the route is undefined. Fail the whole send with 409 naming who is missing rather than silently dropping them.
20. **Desktop browsers give poor coordinates.** Wi-Fi trilateration can be tens of kilometres off, and a VPN can put a user on another continent. Store `home_accuracy_m` so you can see it, show the resolved position back to the user in the gate for confirmation, and let them redo it in settings.
21. **`user.location` is currently unused** (`schema.ts:25`, written nowhere). Safe to repurpose as a label today, but confirm nothing has started writing it first.
22. **The rate limiter is per-serverless-instance.** `RateLimiter` holds an in-memory `Map` (`rate-limiter.ts:18`); Vercel runs many instances and cold starts reset state. The flock is the real control; these are spam friction only. `pigeon_home_limiter` in particular guards a client-controlled write, so treat its limit as advisory.
23. **Do not touch `notification.type`.** Extending its `CHECK` (`schema.ts:159`) needs a full table rebuild, and the read path (`src/lib/server/notifications.ts:40`) ignores the table entirely — it UNION ALLs over like/dislike/repost/follow and hardcodes `unread: false` at :188. Arrival state lives exclusively in `message_delivery` + `conversation_participant.last_read_at`.
24. **`page-content--flush` is dead code** (`layout.css:39-41`) and `bottom-nav.css:60-66` uses `!important` on `.page-content`'s bottom padding. Wire it up in `src/routes/+layout.svelte:108` or the pane fights 1.5rem plus 80px of forced space.
25. **A ten-day flight is imperceptible as motion.** The map alone reads as static. Ship the numeric ETA and progress percentage alongside the marker.

---

## Critical files

- `src/hooks.server.ts:15` — `Permissions-Policy` must allow `geolocation=(self)`. **Do this first.**
- `src/lib/pigeon/flight.ts` — **new**, all flight math and map fuzzing (§1). Build and test second.
- `src/lib/server/db/schema.ts` — tables at `create_tables_sql`:12, indexes at :210, names at :257, plus four `user` `ALTER TABLE` entries
- `src/lib/server/pigeon-post.ts` — **new**, all queries (§5)
- `src/routes/+layout.server.ts:5` — add `home_required` beside the existing `username_required`
- `src/routes/settings/+page.server.ts` — **new**, `update_home` action (the page exists with no server file)
- `src/lib/components/pigeon/FlightMap.svelte` — **new**, the map (§7)
- `src/lib/server/cloudinary.ts` — parameterize `upload_buffer`:43/:55, export `upload_message_attachment`
- `src/lib/components/Sidebar.svelte` — `AppRoute`:9, `is_main_path`:13, `nav_items`:45, badge at :247
- `src/routes/+layout.svelte:108` — the `page-content--flush` one-liner

Keep open for reference: `src/lib/server/db.ts` (`ensure_schema` failure modes :54, :99-133), `src/routes/api/upload-avatar/+server.ts` (upload route template), `src/lib/components/profile/ProfileConnectionsModal.svelte` (row + modal markup), `src/lib/components/Navbar.svelte` (debounced search :92-98, window-event pattern :116,130).
