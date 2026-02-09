import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL ||
  'postgresql://tradenote:tradenote_archive@localhost:5433/setup_archive';

async function runMigrations() {
  console.log('🔄 Connecting to PostgreSQL...');

  const pool = new Pool({
    connectionString,
    max: 1,
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to PostgreSQL');

    const db = drizzle(pool, { schema });

    console.log('🔄 Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations completed');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
