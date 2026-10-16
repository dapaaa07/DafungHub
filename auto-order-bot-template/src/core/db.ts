import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.();
  } catch {}
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[DB] WARNING: DATABASE_URL is not set in environment or .env file.');
}

const isLocalhost =
  connectionString?.includes('localhost') ||
  connectionString?.includes('127.0.0.1') ||
  process.env.NODE_ENV === 'test';

export const pool = new Pool({
  connectionString,
  ssl: isLocalhost ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected idle client error:', err);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return await pool.query<T>(text, params);
}

export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

export async function testConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount === 1;
  } catch (err) {
    console.error('[DB] Connection test failed:', err);
    return false;
  }
}

export interface User {
  id: string;
  telegram_id: string;
  role: 'buyer' | 'admin';
  created_at: Date;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category_id?: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  order_code: string;
  payment_status: 'unpaid' | 'paid' | 'expired';
  fulfillment_status: 'pending' | 'processing' | 'delivered';
  invoice_data: Record<string, unknown>;
  credential_encrypted?: string | null;
  delivered_at?: Date | null;
  created_at: Date;
}
