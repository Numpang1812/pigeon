/**
 * Database Migration Script
 * 
 * Run this once to create the missing tables in your Turso database.
 * Usage: npx tsx src/lib/server/migrate.ts
 */

import { db, ensure_schema } from './db.js';

async function migrate() {
	console.log('🔧 Starting database migration...');
	
	try {
		await ensure_schema();
		console.log('✅ Migration complete!');
		process.exit(0);
	} catch (error) {
		console.error('❌ Migration failed:', error);
		process.exit(1);
	}
}

migrate();
