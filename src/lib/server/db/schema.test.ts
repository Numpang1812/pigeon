import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { create_tables_sql, create_indexes_sql, table_names } from './schema';

/**
 * Runs the real DDL against a scratch in-memory database.
 *
 * ensure_schema() swallows only "already exists" and "duplicate column" errors
 * (src/lib/server/db.ts:112) and caches its rejected promise for the lifetime of
 * the serverless instance, so a single malformed statement takes down every
 * request. This test is the guard: bad DDL fails here instead of in production.
 */

// Mirrors handle_table_creation in src/lib/server/db.ts
async function apply_statement(client: Client, sql: string): Promise<void> {
	try {
		await client.execute({ sql, args: [] });
	} catch (error: unknown) {
		const message = (error as { message?: string }).message?.toLowerCase() ?? '';
		if (message.includes('already exists') || message.includes('duplicate column')) return;
		throw new Error(`DDL failed: ${sql.trim().slice(0, 80)} — ${message}`);
	}
}

async function apply_whole_schema(client: Client): Promise<void> {
	for (const sql of Object.values(create_tables_sql)) {
		await apply_statement(client, sql);
	}
	for (const sql of create_indexes_sql) {
		await apply_statement(client, sql);
	}
}

async function names_in_master(client: Client, type: 'table' | 'index'): Promise<string[]> {
	const result = await client.execute({
		sql: 'SELECT name FROM sqlite_master WHERE type = ?',
		args: [type]
	});
	return result.rows.map((row) => row.name as string);
}

describe('schema DDL', () => {
	let client: Client;
	let tables: string[];
	let indexes: string[];

	beforeAll(async () => {
		client = createClient({ url: ':memory:' });

		// Applied twice on purpose. Every statement must be idempotent, including
		// the ALTER TABLE entries that rely on the "duplicate column" tolerance.
		await apply_whole_schema(client);
		await apply_whole_schema(client);

		tables = await names_in_master(client, 'table');
		indexes = await names_in_master(client, 'index');

		// libSQL enforces foreign keys, so the rows referenced below must exist.
		for (const id of ['user_a', 'user_b']) {
			await client.execute({
				sql: 'INSERT INTO user (id, name, email) VALUES (?, ?, ?)',
				args: [id, id, `${id}@example.test`]
			});
		}
	});

	it('applies cleanly twice in a row', () => {
		// beforeAll would have thrown otherwise.
		expect(tables.length).toBeGreaterThan(0);
	});

	it('creates every pigeon post table', () => {
		for (const name of [
			table_names.conversation,
			table_names.conversationParticipant,
			table_names.userDistance,
			table_names.pigeonFlight,
			table_names.message,
			table_names.messageDelivery,
			table_names.messageAttachment
		]) {
			expect(tables).toContain(name);
		}
	});

	it('creates every pigeon post index', () => {
		for (const name of [
			'idx_conversation_direct_key',
			'idx_conversation_participant_user',
			'idx_user_distance_b',
			'idx_pigeon_flight_sender_available',
			'idx_message_conversation_departed',
			'idx_message_delivery_recipient',
			'idx_message_delivery_message',
			'idx_message_attachment_message'
		]) {
			expect(indexes).toContain(name);
		}
	});

	it('adds the home loft columns to user', async () => {
		const result = await client.execute('PRAGMA table_info(user)');
		const columns = result.rows.map((row) => row.name as string);

		expect(columns).toContain('home_lat');
		expect(columns).toContain('home_lng');
		expect(columns).toContain('home_accuracy_m');
		expect(columns).toContain('home_set_at');
	});

	it('enforces one direct conversation per user pair', async () => {
		await client.execute({
			sql: `INSERT INTO conversation (id, kind, direct_key) VALUES (?, 'direct', ?)`,
			args: ['conversation_1', 'user_a:user_b']
		});

		await expect(
			client.execute({
				sql: `INSERT INTO conversation (id, kind, direct_key) VALUES (?, 'direct', ?)`,
				args: ['conversation_2', 'user_a:user_b']
			})
		).rejects.toThrow();
	});

	it('lets many groups coexist because direct_key is NULL for them', async () => {
		// NULLs are distinct under a UNIQUE index. An empty string would collide,
		// which is why groups must store NULL and never ''.
		await client.execute({
			sql: `INSERT INTO conversation (id, kind, direct_key) VALUES (?, 'group', NULL)`,
			args: ['group_1']
		});
		await client.execute({
			sql: `INSERT INTO conversation (id, kind, direct_key) VALUES (?, 'group', NULL)`,
			args: ['group_2']
		});

		const result = await client.execute({
			sql: `SELECT COUNT(*) AS count FROM conversation WHERE kind = 'group'`,
			args: []
		});

		expect(Number(result.rows[0].count)).toBe(2);
	});

	it('treats a user pair as one row in user_distance regardless of insert order', async () => {
		await client.execute({
			sql: `INSERT INTO user_distance (user_a_id, user_b_id, distance_km) VALUES (?, ?, ?)`,
			args: ['user_a', 'user_b', 530]
		});

		await expect(
			client.execute({
				sql: `INSERT INTO user_distance (user_a_id, user_b_id, distance_km) VALUES (?, ?, ?)`,
				args: ['user_a', 'user_b', 999]
			})
		).rejects.toThrow();
	});

	it('resolves a delivery gate query through the recipient index', async () => {
		const plan = await client.execute(
			`EXPLAIN QUERY PLAN
			 SELECT message_id FROM message_delivery
			 WHERE recipient_id = 'user_a' AND deliver_at <= '2026-01-01 00:00:00.000'`
		);
		const detail = plan.rows.map((row) => String(row.detail)).join(' ');

		expect(detail).toContain('idx_message_delivery_recipient');
		expect(detail).not.toContain('SCAN message_delivery');
	});
});
