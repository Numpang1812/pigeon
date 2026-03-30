import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @libsql/client BEFORE importing the module under test so the singleton
// is created with the fake client from the very first import.
// ---------------------------------------------------------------------------

const mock_execute = vi.fn();
const mock_batch = vi.fn();
const mock_create_client = vi.fn(() => ({
	execute: mock_execute,
	batch: mock_batch
}));

vi.mock('@libsql/client', () => ({
	createClient: mock_create_client
}));

// Set env vars before the module is loaded
process.env.TURSO_DB_URL = 'libsql://test.turso.io';
process.env.TURSO_DB_TOKEN = 'test-token';

// Import AFTER mocks + env are in place
const { db, get, post, del, put, batch } = await import('./server.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const make_result = (rows: object[] = [], rowsAffected = 0, lastInsertRowid = 0n) => ({
	rows,
	rowsAffected,
	lastInsertRowid,
	columns: [],
	columnTypes: [],
	toJSON: () => '{}'
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('db()', () => {
	it('creates the client with url and authToken from env', () => {
		db(); // ensure singleton is initialised
		expect(mock_create_client).toHaveBeenCalledWith({
			url: 'libsql://test.turso.io',
			authToken: 'test-token'
		});
	});

	it('returns the same client instance on repeated calls (singleton)', () => {
		const first = db();
		const second = db();
		expect(first).toBe(second);
	});
});

describe('get()', () => {
	beforeEach(() => mock_execute.mockResolvedValue(make_result([{ id: 1 }])));

	it('executes the SELECT sql with args', async () => {
		const result = await get('SELECT * FROM messages WHERE id = ?', [1]);
		expect(mock_execute).toHaveBeenCalledWith({
			sql: 'SELECT * FROM messages WHERE id = ?',
			args: [1]
		});
		expect(result.rows).toEqual([{ id: 1 }]);
	});

	it('defaults args to an empty array', async () => {
		await get('SELECT 1');
		expect(mock_execute).toHaveBeenCalledWith({ sql: 'SELECT 1', args: [] });
	});
});

describe('post()', () => {
	beforeEach(() => mock_execute.mockResolvedValue(make_result([], 1, 42n)));

	it('executes the INSERT sql with args', async () => {
		const result = await post('INSERT INTO messages (text) VALUES (?)', ['hello']);
		expect(mock_execute).toHaveBeenCalledWith({
			sql: 'INSERT INTO messages (text) VALUES (?)',
			args: ['hello']
		});
		expect(result.rowsAffected).toBe(1);
		expect(result.lastInsertRowid).toBe(42n);
	});
});

describe('del()', () => {
	beforeEach(() => mock_execute.mockResolvedValue(make_result([], 1)));

	it('executes the DELETE sql with args', async () => {
		const result = await del('DELETE FROM messages WHERE id = ?', [5]);
		expect(mock_execute).toHaveBeenCalledWith({
			sql: 'DELETE FROM messages WHERE id = ?',
			args: [5]
		});
		expect(result.rowsAffected).toBe(1);
	});
});

describe('put()', () => {
	beforeEach(() => mock_execute.mockResolvedValue(make_result([], 1)));

	it('executes the UPDATE sql with args', async () => {
		await put('UPDATE messages SET text = ? WHERE id = ?', ['world', 1]);
		expect(mock_execute).toHaveBeenCalledWith({
			sql: 'UPDATE messages SET text = ? WHERE id = ?',
			args: ['world', 1]
		});
	});
});

describe('batch()', () => {
	beforeEach(() => mock_batch.mockResolvedValue([make_result([], 1), make_result([], 1)]));

	it('passes all statements to client.batch()', async () => {
		const stmts = [
			{ sql: 'INSERT INTO a (v) VALUES (?)', args: [1] },
			{ sql: 'INSERT INTO b (v) VALUES (?)', args: [2] }
		];
		const results = await batch(stmts);
		expect(mock_batch).toHaveBeenCalledWith(stmts);
		expect(results).toHaveLength(2);
	});

	it('defaults missing args to empty arrays', async () => {
		await batch([{ sql: 'DELETE FROM tmp' }]);
		expect(mock_batch).toHaveBeenCalledWith([{ sql: 'DELETE FROM tmp', args: [] }]);
	});
});
