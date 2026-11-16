import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

// Force IPv4 to prevent connection timeouts on dual-stack environments without IPv6 internet routing
const ipv4Agent = new https.Agent({ family: 4, keepAlive: true });

const CACHE_DIR = path.join(process.cwd(), '.cache', 'order-media');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export interface TelegramMediaResult {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
  textContent?: string;
  isPhoto: boolean;
  isText: boolean;
}

/**
 * Execute Telegram Bot API method via HTTPS with explicit IPv4
 */
export function callTelegramApiDirect<T = unknown>(
  method: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; result?: T; description?: string }> {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return resolve({ ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' });
    }

    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${method}`,
        method: 'POST',
        agent: ipv4Agent,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(rawData));
          } catch (e) {
            reject(new Error(`Failed to parse Telegram API JSON response: ${rawData}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Download file directly from Telegram servers via HTTPS with explicit IPv4
 */
export function downloadTelegramFileBuffer(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return reject(new Error('TELEGRAM_BOT_TOKEN is not configured'));
    }

    const req = https.get(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/file/bot${token}/${filePath}`,
        agent: ipv4Agent,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Telegram file download returned HTTP ${res.statusCode}`));
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      }
    );

    req.on('error', reject);
  });
}

/**
 * Fetch and cache media delivered via Telegram bot
 */
export async function getDeliveredTelegramMedia(
  fileId: string,
  preferredFileName?: string,
  preferredMimeType?: string
): Promise<TelegramMediaResult | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !fileId) {
    return null;
  }

  ensureCacheDir();
  const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cacheMetaPath = path.join(CACHE_DIR, `${safeFileId}.meta.json`);
  const cacheDataPath = path.join(CACHE_DIR, `${safeFileId}.bin`);

  // 1. Check local disk cache first
  if (fs.existsSync(cacheMetaPath) && fs.existsSync(cacheDataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(cacheMetaPath, 'utf-8'));
      const buffer = fs.readFileSync(cacheDataPath);
      const isText =
        Boolean(meta.isText) ||
        /\.(txt|json|csv|log|tsv)$/i.test(meta.fileName) ||
        String(meta.mimeType).startsWith('text/');
      const textContent = isText ? buffer.toString('utf-8') : undefined;

      return {
        buffer,
        fileName: preferredFileName || meta.fileName || 'lampiran',
        mimeType: preferredMimeType || meta.mimeType || 'application/octet-stream',
        fileSize: buffer.length,
        textContent,
        isPhoto:
          Boolean(meta.isPhoto) ||
          /\.(jpe?g|png|webp|gif|bmp)$/i.test(meta.fileName) ||
          String(meta.mimeType).startsWith('image/'),
        isText,
      };
    } catch {
      // Re-fetch if cache file was damaged
    }
  }

  // 2. Request fresh file path from Telegram API
  const fileRes = await callTelegramApiDirect<{
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  }>('getFile', { file_id: fileId });

  if (!fileRes.ok || !fileRes.result?.file_path) {
    console.warn('[Telegram Media] getFile failed for fileId:', fileId, fileRes.description);
    return null;
  }

  const filePath = fileRes.result.file_path;
  const buffer = await downloadTelegramFileBuffer(filePath);

  // 3. Resolve metadata and MIME
  const pathFileName = path.basename(filePath);
  const resolvedFileName = preferredFileName || pathFileName || 'lampiran';
  let resolvedMimeType = preferredMimeType || 'application/octet-stream';

  const isPhoto =
    /\.(jpe?g|png|webp|gif|bmp)$/i.test(resolvedFileName) ||
    resolvedMimeType.startsWith('image/');
  const isText =
    /\.(txt|json|csv|log|tsv)$/i.test(resolvedFileName) ||
    resolvedMimeType.startsWith('text/');

  if (isPhoto && resolvedMimeType === 'application/octet-stream') {
    if (/\.png$/i.test(resolvedFileName)) resolvedMimeType = 'image/png';
    else if (/\.webp$/i.test(resolvedFileName)) resolvedMimeType = 'image/webp';
    else resolvedMimeType = 'image/jpeg';
  } else if (isText) {
    resolvedMimeType = 'text/plain; charset=utf-8';
  }

  const textContent = isText ? buffer.toString('utf-8') : undefined;

  // 4. Save to cache
  try {
    fs.writeFileSync(cacheDataPath, buffer);
    fs.writeFileSync(
      cacheMetaPath,
      JSON.stringify(
        {
          fileId,
          fileName: resolvedFileName,
          mimeType: resolvedMimeType,
          fileSize: buffer.length,
          isPhoto,
          isText,
          cachedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );
  } catch (cacheErr) {
    console.warn('[Telegram Media] Failed to write cache:', cacheErr);
  }

  return {
    buffer,
    fileName: resolvedFileName,
    mimeType: resolvedMimeType,
    fileSize: buffer.length,
    textContent,
    isPhoto,
    isText,
  };
}
