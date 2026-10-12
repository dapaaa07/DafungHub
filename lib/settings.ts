import { query } from './db';

export type BotStatus = 'online' | 'maintenance';

let cachedStatus: BotStatus | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache for serverless efficiency

/**
 * Get current bot operational status (online vs maintenance)
 * Cached with short TTL to reduce database query overhead in serverless environments
 */
export async function getBotStatus(): Promise<BotStatus> {
  const now = Date.now();
  if (cachedStatus !== null && now < cacheExpiry) {
    return cachedStatus;
  }

  try {
    const res = await query(
      'SELECT value FROM bot_settings WHERE key = $1 LIMIT 1',
      ['bot_status']
    );

    if (res.rows.length > 0) {
      const val = res.rows[0].value;
      cachedStatus = val === 'maintenance' ? 'maintenance' : 'online';
    } else {
      cachedStatus = 'online';
    }
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedStatus;
  } catch (error) {
    console.error('[Settings] Error fetching bot status, falling back:', error);
    return cachedStatus ?? 'online';
  }
}

/**
 * Update the bot operational status
 * Immediately updates database and invalidates local memory cache
 */
export async function setBotStatus(status: BotStatus): Promise<void> {
  try {
    await query(
      `INSERT INTO bot_settings (key, value, updated_at)
       VALUES ('bot_status', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [status]
    );
    cachedStatus = status;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    console.log(`[Settings] Bot operational status changed to: ${status.toUpperCase()}`);
  } catch (error) {
    console.error('[Settings] Failed to set bot status in DB, fallback to memory cache:', error);
    cachedStatus = status;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
  }
}

/**
 * Helper to clear memory cache (primarily used in automated tests)
 */
export function clearSettingsCache(): void {
  cachedStatus = null;
  cacheExpiry = 0;
}
