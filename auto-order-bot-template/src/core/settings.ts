import { query } from './db';

let cachedBotStatus: 'online' | 'maintenance' | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5000;

export async function getBotStatus(): Promise<'online' | 'maintenance'> {
  const now = Date.now();
  if (cachedBotStatus && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedBotStatus;
  }

  try {
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = 'bot_status' LIMIT 1`
    );

    if (res.rows.length > 0 && (res.rows[0].value === 'maintenance' || res.rows[0].value === 'online')) {
      cachedBotStatus = res.rows[0].value as 'online' | 'maintenance';
    } else {
      cachedBotStatus = 'online';
    }
  } catch (err) {
    console.error('[Settings] Failed to fetch bot_status from DB, falling back to cache/online:', err);
    cachedBotStatus = cachedBotStatus || 'online';
  }

  lastFetchTime = now;
  return cachedBotStatus;
}

export async function setBotStatus(status: 'online' | 'maintenance'): Promise<void> {
  cachedBotStatus = status;
  lastFetchTime = Date.now();

  await query(
    `INSERT INTO bot_settings (key, value, updated_at)
     VALUES ('bot_status', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE
     SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [status]
  );

  console.log(`[Settings] Bot operational status changed to: ${status.toUpperCase()}`);
}

export function clearSettingsCache(): void {
  cachedBotStatus = null;
  lastFetchTime = 0;
}
