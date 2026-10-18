import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type UserRole = 'buyer' | 'admin';
export type PaymentStatus = 'unpaid' | 'paid' | 'expired';
export type FulfillmentStatus = 'pending' | 'processing' | 'delivered';

export interface User {
  id: string;
  telegram_id: string;
  role: UserRole;
  balance?: number;
  username?: string | null;
  first_name?: string | null;
  membership_tier?: string;
  membership_expires_at?: Date | null;
  weekly_discount_used?: number;
  weekly_discount_reset_at?: Date | null;
  created_at: Date;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  category_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Order {
  id: string;
  user_id: string;
  product_id: string;
  order_code: string;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  invoice_data: Record<string, unknown>;
  credential_encrypted: string | null;
  delivered_at: Date | null;
  is_broadcasted?: boolean;
  created_at: Date;
}

// Auto-load .env for standalone scripts / bot runners outside Next.js runtime
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

// Global declaration for Next.js hot-reload development singleton
declare global {
  var postgresPoolGlobal: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  const isRemote =
    connectionString?.includes('supabase.co') ||
    connectionString?.includes('pooler.supabase.com') ||
    connectionString?.includes('sslmode=require');

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool = globalThis.postgresPoolGlobal ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalThis.postgresPoolGlobal = pool;
}

export function getPool(): Pool {
  return pool;
}

/**
 * Execute a parameterized SQL query using the connection pool.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.debug('[DB Query]', { text, duration, rows: res.rowCount });
  }

  return res;
}

/**
 * Acquire a dedicated client from the pool (e.g. for multi-statement transactions).
 */
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

/**
 * Health check helper to test database connectivity.
 */
export async function testConnection(): Promise<boolean> {
  try {
    const res = await pool.query('SELECT 1 as alive');
    return res.rows?.[0]?.alive === 1;
  } catch (error) {
    console.error('Failed to connect to PostgreSQL database:', error);
    return false;
  }
}

export default pool;
