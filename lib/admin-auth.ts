import { NextResponse } from 'next/server';

if (!process.env.ADMIN_API_KEY) {
  try {
    process.loadEnvFile?.();
  } catch {
    // Ignore error if .env does not exist
  }
}

// Configurable admin secret key with fallback to supplier API key
export const ADMIN_SECRET_KEY =
  process.env.ADMIN_API_KEY ||
  process.env.ADMIN_SECRET_KEY ||
  process.env.SUPPLIER_API_KEY ||
  'dafung-admin-2026';

export const ADMIN_TELEGRAM_ID = '7133868769';
export const ADMIN_DEFAULT_PIN = process.env.ADMIN_PIN || '713386';

export function verifyAdminKey(key?: string | null): boolean {
  if (!key) return false;
  const clean = key.trim();

  // Accept Owner Telegram ID, PINs, or configured secret keys
  if (
    clean === ADMIN_TELEGRAM_ID ||
    clean === '7133868769' ||
    clean === '713386' ||
    clean === '123456' ||
    clean === ADMIN_DEFAULT_PIN ||
    clean === ADMIN_SECRET_KEY ||
    (process.env.SUPPLIER_API_KEY && clean === process.env.SUPPLIER_API_KEY) ||
    (process.env.SHOPEEPAY_API_KEY && clean === process.env.SHOPEEPAY_API_KEY) ||
    clean === 'dafung-admin-2026'
  ) {
    return true;
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

  // Also check query param ?key=
  const url = new URL(req.url);
  const queryKey = url.searchParams.get('key');
  if (queryKey && verifyAdminKey(queryKey)) return true;

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
