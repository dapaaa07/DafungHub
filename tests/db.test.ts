import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import pool, { query, getPool, getClient, testConnection } from '../lib/db';

after(async () => {
  // Gracefully close pool after test suite completes
  await pool.end();
});

test('DB Connection Utility: pool is a singleton instance', () => {
  assert.ok(pool, 'Pool instance must exist');
  assert.strictEqual(pool, getPool(), 'getPool() must return the same singleton pool instance');
});

test('DB Connection Utility: Acceptance Test - queries SELECT 1 without error', async () => {
  const result = await query<{ num: number }>('SELECT 1 as num');
  assert.ok(result, 'Query result must be returned');
  assert.ok(Array.isArray(result.rows), 'Query result must contain rows array');
  assert.strictEqual(result.rows.length, 1, 'Query must return exactly 1 row');
  assert.strictEqual(Number(result.rows[0].num), 1, 'SELECT 1 must return value 1');
});

test('DB Connection Utility: testConnection() returns true', async () => {
  const isHealthy = await testConnection();
  assert.strictEqual(isHealthy, true, 'testConnection() should return true for active DB');
});

test('DB Connection Utility: getClient() acquires and releases client cleanly', async () => {
  const client = await getClient();
  try {
    const res = await client.query('SELECT 1 as ping');
    assert.strictEqual(Number(res.rows[0].ping), 1);
  } finally {
    client.release();
  }
});
