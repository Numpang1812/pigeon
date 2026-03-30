import { createClient, type ResultSet, type InValue } from '@libsql/client';

// ---------------------------------------------------------------------------
// Client singleton – created once per server process
// ---------------------------------------------------------------------------

function create_db() {
	const url = process.env.TURSO_DB_URL;
	const auth_token = process.env.TURSO_DB_TOKEN;

	if (!url) throw new Error('TURSO_DB_URL is not set');
	if (!auth_token) throw new Error('TURSO_DB_TOKEN is not set');

	return createClient({ url, authToken: auth_token });
}

let db_client: ReturnType<typeof create_db> | null = null;

export function db() {
	if (!db_client) db_client = create_db();
	return db_client;
}

// ---------------------------------------------------------------------------
// Generic query helpers  (cyclomatic complexity ≤ 3 each)
// ---------------------------------------------------------------------------

/** GET – run a SELECT and return all rows. */
export async function get(sql: string, args: InValue[] = []): Promise<ResultSet> {
	return db().execute({ sql, args });
}

/** POST – run an INSERT and return the result (lastInsertRowid etc.). */
export async function post(sql: string, args: InValue[] = []): Promise<ResultSet> {
	return db().execute({ sql, args });
}

/** DELETE – run a DELETE and return the result (rowsAffected etc.). */
export async function del(sql: string, args: InValue[] = []): Promise<ResultSet> {
	return db().execute({ sql, args });
}

/** PUT / PATCH – run an UPDATE and return the result. */
export async function put(sql: string, args: InValue[] = []): Promise<ResultSet> {
	return db().execute({ sql, args });
}

/** Batch – run multiple statements in a single round-trip (atomic). */
export async function batch(statements: { sql: string; args?: InValue[] }[]): Promise<ResultSet[]> {
	return db().batch(statements.map(({ sql, args = [] }) => ({ sql, args })));
}
