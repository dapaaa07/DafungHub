import crypto from 'crypto';
import { NextResponse } from 'next/server';

if (!process.env.ADMIN_API_KEY && !process.env.ADMIN_SECRET_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

export const ADMIN_SECRET_KEY =
  process.env.ADMIN_API_KEY ||
  process.env.ADMIN_SECRET_KEY ||
  '';

export const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '7133868769';

function safeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getConfiguredAdminKeys(): string[] {
  const keys: string[] = [];
  const primary = process.env.ADMIN_API_KEY || process.env.ADMIN_SECRET_KEY;
  if (primary && primary.trim().length > 0) {
    keys.push(primary.trim());
  }
  const pin = process.env.ADMIN_PIN;
  if (pin && pin.trim().length > 0) {
    keys.push(pin.trim());
  }
  return keys;
}

export function verifyAdminKey(key?: string | null): boolean {
  if (!key) return false;
  const clean = key.trim();
  if (!clean) return false;

  const configuredKeys = getConfiguredAdminKeys();
  if (configuredKeys.length === 0) {
    console.error('[Admin Auth] ADMIN_API_KEY is not configured in environment. Failing closed.');
    return false;
  }

  for (const validKey of configuredKeys) {
    if (safeEqual(clean, validKey)) {
      return true;
    }
  }

  return false;
}

export function verifyAdminRequest(req: Request): boolean {
  const headerKey = req.headers.get('x-admin-key');
  if (headerKey && verifyAdminKey(headerKey)) return true;

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (verifyAdminKey(token)) return true;
  }

  return false;
}

export function unauthorizedResponse(message = 'Akses admin tidak diizinkan. Kunci API tidak valid.') {
  return NextResponse.json(
    {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    },
    { status: 401 }
  );
}
