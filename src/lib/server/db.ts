import { createClient, type Client } from '@libsql/client';
import { env } from '$env/dynamic/private';

let db_client: Client | null = null;

export function get_client() {
	if (!db_client) {
		const url = env.TURSO_DB_URL;
		const token = env.TURSO_DB_TOKEN;

		console.log('[DB] TURSO_DB_URL:', url ? 'set' : 'undefined');
		console.log('[DB] TURSO_DB_TOKEN:', token ? 'set' : 'undefined');

		if (!url || !token) {
			throw new Error(
				`Missing Turso credentials: TURSO_DB_URL=${url ? '***' : 'undefined'}, TURSO_DB_TOKEN=${token ? '***' : 'undefined'}`
			);
		}

		db_client = createClient({
			url,
			authToken: token
		});
		console.log('[DB] Client created successfully');
	}
	return db_client;
}

export const db = new Proxy({} as Client, {
	get(_target, prop) {
		const client = get_client();
		return Reflect.get(client, prop);
	}
});
