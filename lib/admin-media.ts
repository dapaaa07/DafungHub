import { query } from './db';

export interface SavedAdminMedia {
  hasMedia?: boolean;
  type: 'document' | 'photo' | 'video' | 'audio' | 'voice' | 'sticker' | 'animation' | 'none';
  fileId: string;
  fileName: string;
  mimeType?: string;
  fromChatId: number | string;
  messageId?: number;
  savedAt: number;
}

export interface AdminFulfillDraft {
  orderCode: string;
  notes?: string;
  withMedia?: boolean;
}

// In-memory caches for low-latency lookups
const mediaMemoryCache = new Map<string, SavedAdminMedia>();
const fulfillDraftMemoryCache = new Map<string, AdminFulfillDraft>();

/**
 * Save the latest media sent by an admin.
 * Writes to in-memory cache and persists to PostgreSQL `bot_settings`.
 */
export async function saveLastAdminMedia(
  chatId: number | string,
  media: SavedAdminMedia
): Promise<void> {
  const key = String(chatId);
  mediaMemoryCache.set(key, media);

  try {
    const dbKey = `last_admin_media_${key}`;
    await query(
      `INSERT INTO bot_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [dbKey, JSON.stringify(media)]
    );
  } catch (err) {
    console.warn('[AdminMedia] Failed to persist last admin media to DB:', err);
  }
}

/**
 * Get the latest media sent by an admin.
 * Checks in-memory cache first, then falls back to PostgreSQL `bot_settings`.
 */
export async function getLastAdminMedia(
  chatId: number | string
): Promise<SavedAdminMedia | null> {
  const key = String(chatId);
  if (mediaMemoryCache.has(key)) {
    return mediaMemoryCache.get(key)!;
  }

  try {
    const dbKey = `last_admin_media_${key}`;
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = $1 LIMIT 1`,
      [dbKey]
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      const parsed = JSON.parse(res.rows[0].value) as SavedAdminMedia;
      mediaMemoryCache.set(key, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('[AdminMedia] Failed to retrieve last admin media from DB:', err);
  }

  return null;
}

/**
 * Clear the latest admin media cache & DB entry.
 */
export async function clearLastAdminMedia(chatId: number | string): Promise<void> {
  const key = String(chatId);
  mediaMemoryCache.delete(key);
  try {
    const dbKey = `last_admin_media_${key}`;
    await query(`DELETE FROM bot_settings WHERE key = $1`, [dbKey]);
  } catch (err) {
    console.warn('[AdminMedia] Failed to delete last admin media from DB:', err);
  }
}

/**
 * Save pending fulfillment draft for an admin.
 */
export async function saveAdminFulfillDraft(
  chatId: number | string,
  draft: AdminFulfillDraft
): Promise<void> {
  const key = String(chatId);
  fulfillDraftMemoryCache.set(key, draft);

  try {
    const dbKey = `pending_fulfill_draft_${key}`;
    await query(
      `INSERT INTO bot_settings (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [dbKey, JSON.stringify(draft)]
    );
  } catch (err) {
    console.warn('[AdminMedia] Failed to persist fulfill draft to DB:', err);
  }
}

/**
 * Get pending fulfillment draft for an admin.
 */
export async function getAdminFulfillDraft(
  chatId: number | string
): Promise<AdminFulfillDraft | null> {
  const key = String(chatId);
  if (fulfillDraftMemoryCache.has(key)) {
    return fulfillDraftMemoryCache.get(key)!;
  }

  try {
    const dbKey = `pending_fulfill_draft_${key}`;
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = $1 LIMIT 1`,
      [dbKey]
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      const parsed = JSON.parse(res.rows[0].value) as AdminFulfillDraft;
      fulfillDraftMemoryCache.set(key, parsed);
      return parsed;
    }
  } catch (err) {
    console.warn('[AdminMedia] Failed to retrieve fulfill draft from DB:', err);
  }

  return null;
}

/**
 * Clear pending fulfillment draft for an admin.
 */
export async function clearAdminFulfillDraft(chatId: number | string): Promise<void> {
  const key = String(chatId);
  fulfillDraftMemoryCache.delete(key);
  try {
    const dbKey = `pending_fulfill_draft_${key}`;
    await query(`DELETE FROM bot_settings WHERE key = $1`, [dbKey]);
  } catch (err) {
    console.warn('[AdminMedia] Failed to delete fulfill draft from DB:', err);
  }
}
