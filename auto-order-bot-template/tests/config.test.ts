import assert from 'node:assert/strict';
import test from 'node:test';
import { config, isBotAdmin } from '../config/bot.config';

test('Template Config: Store settings have defaults', () => {
  assert.ok(config.store.name, 'Store name must be set');
  assert.ok(config.store.tagline, 'Tagline must be set');
  assert.strictEqual(config.store.currency, 'IDR');
  assert.strictEqual(config.store.currencySymbol, 'Rp');
});

test('Template Config: isBotAdmin validates admin IDs accurately', () => {
  const ownerId = config.admin.ownerId;
  assert.strictEqual(isBotAdmin(ownerId), true, 'Owner ID must be recognized as admin');
  assert.strictEqual(isBotAdmin(Number(ownerId)), true, 'Numeric owner ID must be recognized as admin');
  assert.strictEqual(isBotAdmin('999999999999_fake'), false, 'Non-admin ID must be rejected');
  assert.strictEqual(isBotAdmin(null), false, 'Null ID must be rejected');
});
