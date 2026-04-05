/**
 * Database Migration Script
 * 
 * Run this once to create the missing tables in your Turso database.
 * Usage: npx tsx src/lib/server/migrate.ts
 */

import { ensure_schema } from './db.js';

async function migrate() {
	console.info('🔧 Starting database migration...');
	
	try {
		await ensure_schema();
		console.info('✅ Migration complete!');
		process.exit(0);
	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	}
}

migrate();
