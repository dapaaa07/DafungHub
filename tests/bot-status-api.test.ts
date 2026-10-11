import test from 'node:test';
import assert from 'node:assert';
import { GET } from '../app/api/bot-status/route';
import { setBotStatus, clearSettingsCache } from '../lib/settings';

test('Bot Status API: returns live status and proper Cache-Control headers', async () => {
  clearSettingsCache();

  try {
    // 1. Ensure online
    await setBotStatus('online');
    const resOnline = await GET();
    assert.strictEqual(resOnline.status, 200);

    const dataOnline = await resOnline.json();
    assert.strictEqual(dataOnline.status, 'online');
    assert.ok(dataOnline.timestamp);

    const cacheHeader = resOnline.headers.get('cache-control');
    assert.ok(cacheHeader?.includes('no-store'), 'Headers must include no-store');

    // 2. Toggle to maintenance
    await setBotStatus('maintenance');
    const resMaint = await GET();
    assert.strictEqual(resMaint.status, 200);

    const dataMaint = await resMaint.json();
    assert.strictEqual(dataMaint.status, 'maintenance');

    // 3. Toggle back to online
    await setBotStatus('online');
    const resOnlineAgain = await GET();
    assert.strictEqual(resOnlineAgain.status, 200);

    const dataOnlineAgain = await resOnlineAgain.json();
    assert.strictEqual(dataOnlineAgain.status, 'online');
  } finally {
    await setBotStatus('online');
  }
});
