import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Auto-load .env
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.();
  } catch {}
}

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ Error: DATABASE_URL is not set in environment or .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
});

async function runSetup() {
  console.log('🚀 Running Database Schema Setup...');
  const schemaPath = path.resolve(__dirname, '../database/schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error(`❌ Schema file not found at: ${schemaPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Database schema and tables created successfully!');

    // Verify created tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('📋 Verified Tables in Database:');
    res.rows.forEach((r) => console.log(`   - ${r.table_name}`));
  } catch (err) {
    console.error('❌ Error executing database schema:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runSetup();
