import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

export async function runMigrations(customConnectionString?: string): Promise<void> {
  const connectionString = customConnectionString || process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }

  const isRemote =
    connectionString.includes('supabase.co') ||
    connectionString.includes('pooler.supabase.com') ||
    connectionString.includes('sslmode=require');

  const pool = new Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();

  try {
    console.log('[Migration] Connected to PostgreSQL. Starting migrations...');
    await client.query('BEGIN');

    // Migration directory
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`[Migration] Executing: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      await client.query(sql);
      console.log(`[Migration] Completed: ${file}`);
    }

    await client.query('COMMIT');
    console.log('[Migration] All migrations executed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Migration] Migration failed and rolled back:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// If run directly from CLI
if (require.main === module || process.argv[1]?.includes('migrate.ts')) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration] Error:', err);
      process.exit(1);
    });
}
