import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import * as dbModule from '../lib/db';

test('Database Schema: 001_init_schema.sql contains required tables and columns', () => {
  const sqlPath = path.join(process.cwd(), 'migrations', '001_init_schema.sql');
  assert.ok(fs.existsSync(sqlPath), 'Migration SQL file must exist');

  const sql = fs.readFileSync(sqlPath, 'utf-8');

  // Verify extensions and types
  assert.match(sql, /CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"pgcrypto"/i);
  assert.match(sql, /CREATE\s+TYPE\s+user_role\s+AS\s+ENUM\s*\(\s*'buyer'\s*,\s*'admin'\s*\)/i);
  assert.match(sql, /CREATE\s+TYPE\s+payment_status\s+AS\s+ENUM\s*\(\s*'unpaid'\s*,\s*'paid'\s*,\s*'expired'\s*\)/i);
  assert.match(sql, /CREATE\s+TYPE\s+fulfillment_status\s+AS\s+ENUM\s*\(\s*'pending'\s*,\s*'processing'\s*,\s*'delivered'\s*\)/i);

  // Verify users table
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users/i);
  assert.match(sql, /id\s+UUID\s+PRIMARY\s+KEY/i);
  assert.match(sql, /telegram_id\s+VARCHAR\(\d+\)\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(sql, /role\s+user_role\s+NOT\s+NULL/i);
  assert.match(sql, /created_at\s+TIMESTAMP/i);

  // Verify products table
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+products/i);
  assert.match(sql, /name\s+VARCHAR\(\d+\)\s+NOT\s+NULL/i);
  assert.match(sql, /price\s+INTEGER\s+NOT\s+NULL/i);
  assert.match(sql, /stock\s+INTEGER\s+NOT\s+NULL/i);
  assert.match(sql, /category_id\s+UUID\s+NULL/i);
  assert.match(sql, /is_active\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+TRUE/i);

  // Verify orders table
  assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+orders/i);
  assert.match(sql, /user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+users\(id\)/i);
  assert.match(sql, /product_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+products\(id\)/i);
  assert.match(sql, /order_code\s+VARCHAR\(\d+\)\s+NOT\s+NULL\s+UNIQUE/i);
  assert.match(sql, /payment_status\s+payment_status/i);
  assert.match(sql, /fulfillment_status\s+fulfillment_status/i);
  assert.match(sql, /invoice_data\s+JSONB/i);
  assert.match(sql, /credential_encrypted\s+TEXT\s+NULL/i);
  assert.match(sql, /delivered_at\s+TIMESTAMP/i);
});

test('lib/db.ts exports expected pool and query helper functions', () => {
  assert.ok(typeof dbModule.query === 'function', 'query function must be exported');
  assert.ok(typeof dbModule.getPool === 'function', 'getPool function must be exported');
  assert.ok(typeof dbModule.getClient === 'function', 'getClient function must be exported');
  assert.ok(typeof dbModule.testConnection === 'function', 'testConnection function must be exported');
});

test('prisma/schema.prisma contains matching models and relations', () => {
  const prismaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  assert.ok(fs.existsSync(prismaPath), 'prisma/schema.prisma must exist');

  const prismaSchema = fs.readFileSync(prismaPath, 'utf-8');
  assert.match(prismaSchema, /model\s+User/);
  assert.match(prismaSchema, /model\s+Product/);
  assert.match(prismaSchema, /model\s+Order/);
  assert.match(prismaSchema, /enum\s+UserRole/);
  assert.match(prismaSchema, /enum\s+PaymentStatus/);
  assert.match(prismaSchema, /enum\s+FulfillmentStatus/);
});
