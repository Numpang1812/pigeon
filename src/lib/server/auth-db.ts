import { env } from '$env/dynamic/private';
import { LibsqlDialect } from '@libsql/kysely-libsql';

let libsql_dialect: LibsqlDialect | null = null;


export function get_auth_db_dialect() {
	if (!libsql_dialect) {
		const url = env.TURSO_DB_URL;
		const token = env.TURSO_DB_TOKEN;

		if (!url || !token) {
			throw new Error(
				`Missing Turso credentials: TURSO_DB_URL=${url ? '***' : 'undefined'}, TURSO_DB_TOKEN=${token ? '***' : 'undefined'}`
			);
		}

		libsql_dialect = new LibsqlDialect({
			url,
			authToken: token
		});
	}

	return libsql_dialect;
}
