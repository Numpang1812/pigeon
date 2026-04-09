import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';
import { create_tables_sql, create_indexes_sql } from './db/schema';

let db_client: Client | null = null;
let init_promise: Promise<void> | null = null;

const is_dev = process.env.NODE_ENV !== 'production';

export function get_client() {
	if (!db_client) {
		const url = env.TURSO_DB_URL;
		const token = env.TURSO_DB_TOKEN;

		if (is_dev) {
			console.info('[DB] TURSO_DB_URL:', url ? 'set' : 'undefined');
			console.info('[DB] TURSO_DB_TOKEN:', token ? 'set' : 'undefined');
		}

		if (!url || !token) {
			throw new Error(
				`Missing Turso credentials: TURSO_DB_URL=${url ? '***' : 'undefined'}, TURSO_DB_TOKEN=${token ? '***' : 'undefined'}`
			);
		}

		db_client = createClient({
			url,
			authToken: token
		});

		if (is_dev) {
			console.info('[DB] Client created successfully');
		}
	}
	return db_client;
}

export const db = new Proxy({} as Client, {
	get(_target, prop) {
		const client = get_client();
		const value = Reflect.get(client, prop);
		// Bind methods to the real client so private fields (#promiseLimitFunction etc.) work
		if (typeof value === 'function') {
			return value.bind(client);
		}
		return value;
	}
});

/**
 * Ensure database schema is initialized
 * Call this before running queries that depend on application tables
 */
export async function ensure_schema(): Promise<void> {
	if (init_promise) {
		return init_promise;
	}

	init_promise = (async () => {
		if (is_dev) {
			console.info('[DB Schema] ========== STARTING SCHEMA INITIALIZATION ==========');
			console.info('[DB Schema] Tables to create:', Object.keys(create_tables_sql).join(', '));
		}

		try {
			// Create application tables
			const table_entries = Object.entries(create_tables_sql);
			for (const [name, sql] of table_entries) {
				await handle_table_creation(name, sql);
			}

			if (is_dev) {
				console.info('[DB Schema] All application tables verified');
			}

			// Create indexes
			if (is_dev) {
				console.info('[DB Schema] Creating indexes...');
			}
			for (const sql of create_indexes_sql) {
				await handle_index_creation(sql);
			}

			if (is_dev) {
				console.info('[DB Schema] All indexes verified');
				console.info('[DB Schema] ========== DATABASE INITIALIZATION COMPLETE ✅ ==========');
			}
		} catch (error) {
			console.error('[DB Schema] ========== FATAL SCHEMA INITIALIZATION ERROR ==========');
			console.error('[DB Schema] Error:', error);
			throw error;
		}
	})();

	return init_promise;
}

async function handle_table_creation(name: string, sql: string) {
	if (is_dev) {
		console.info(`[DB Schema] ${sql.startsWith('CREATE TABLE') ? 'Creating table' : 'Altering table'}: ${name}...`);
	}
	try {
		await db.execute({ sql, args: [] });
		if (is_dev) {
			console.info(`[DB Schema] ✅ Success: ${name}`);
		}
	} catch (table_err: unknown) {
		const table_error = table_err as { message?: string };
		const msg = table_error.message?.toLowerCase() || '';
		// Ignore "already exists" or "duplicate column" errors
		if (msg.includes('already exists') || msg.includes('duplicate column')) {
			if (is_dev) {
				console.info(`[DB Schema] ℹ️  Already exists: ${name}`);
			}
		} else {
			console.error(`[DB Schema] ❌ Error on ${name}:`, table_error.message);
			throw table_error;
		}
	}
}

async function handle_index_creation(sql: string) {
	try {
		await db.execute({ sql, args: [] });
	} catch (idx_err: unknown) {
		const index_error = idx_err as { message?: string };
		// Index might already exist, which is fine
		if (!index_error.message?.includes('already exists')) {
			console.error('[DB Schema] Index error:', index_error.message);
		}
	}
}
