import crypto from 'crypto';
import { query, User } from './db';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.AES_SECRET_KEY ||
  'dafung-hub-customer-session-secret-2026';

export const CUSTOMER_COOKIE_NAME = 'dafung_customer_token';
export const TOKEN_EXPIRY_DAYS = 30;

export interface CustomerSessionPayload {
  sub: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  iat: number;
  exp: number;
}

export interface CustomerProfile {
  id: string;
  display_id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  telegram_id: string | null;
  avatar_url: string | null;
  role: string;
  balance: number;
  membership_tier: string;
  membership_expires_at: string | null;
  created_at: string;
}

/**
 * Hash password securely with scrypt + random salt
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify password against stored scrypt hash with timing attack resistance
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;

    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);

    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Normalize and validate identifier (Email or Indonesian Phone Number)
 */
export function parseIdentifier(raw: string): {
  type: 'email' | 'phone';
  value: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error('Format email tidak valid.');
    }
    return { type: 'email', value: trimmed.toLowerCase() };
  }

  // Indonesian Phone Normalization (08xxx, 628xxx, +628xxx -> 628xxx)
  let cleanDigits = trimmed.replace(/\D/g, '');
  if (cleanDigits.startsWith('08')) {
    cleanDigits = '62' + cleanDigits.substring(1);
  } else if (cleanDigits.startsWith('8')) {
    cleanDigits = '628' + cleanDigits.substring(1);
  }

  if (!cleanDigits.startsWith('628') || cleanDigits.length < 10 || cleanDigits.length > 15) {
    throw new Error('Format nomor HP tidak valid. Masukkan nomor WhatsApp aktif (contoh: 08123456789).');
  }

  return { type: 'phone', value: cleanDigits };
}

/**
 * Generate HMAC SHA-256 Signed JWT Token
 */
export function signCustomerToken(user: User): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: CustomerSessionPayload = {
    sub: user.id,
    email: user.email || null,
    phone: user.phone || null,
    role: user.role || 'buyer',
    iat: now,
    exp: now + TOKEN_EXPIRY_DAYS * 24 * 3600,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  return `${header}.${body}.${signature}`;
}

/**
 * Verify HMAC SHA-256 Signed JWT Token
 */
export function verifyCustomerToken(token: string): CustomerSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload: CustomerSessionPayload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    );

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Format clean customer display ID for web users and telegram users
 */
export function getCustomerDisplayId(user: { id: string; telegram_id?: string | null }): string {
  if (user.telegram_id && user.telegram_id.trim() && user.telegram_id !== 'Guest') {
    return user.telegram_id;
  }
  const cleanId = (user.id || '').replace(/-/g, '').substring(0, 8).toUpperCase();
  return cleanId ? `WEB-${cleanId}` : 'WEB-BUYER';
}

/**
 * Generate a clean, unique username from email prefix or identifier
 */
export async function generateUniqueUsername(
  emailOrIdentifier: string,
  excludeUserId?: string
): Promise<string> {
  let base = (emailOrIdentifier || '').split('@')[0].toLowerCase().trim();
  base = base.replace(/[^a-z0-9_]/g, '');
  if (!base || base.length < 3) {
    base = `user_${Math.random().toString(36).substring(2, 7)}`;
  }
  base = base.substring(0, 24);

  let candidate = base;
  let counter = 1;
  while (true) {
    const checkSql = excludeUserId
      ? 'SELECT id FROM public.users WHERE LOWER(username) = $1 AND id <> $2 LIMIT 1'
      : 'SELECT id FROM public.users WHERE LOWER(username) = $1 LIMIT 1';
    const params = excludeUserId ? [candidate, excludeUserId] : [candidate];
    const res = await query(checkSql, params);
    if (res.rows.length === 0) {
      return candidate;
    }
    candidate = `${base.substring(0, 20)}${counter}`;
    counter++;
    if (counter > 20) {
      return `${base.substring(0, 16)}_${Date.now().toString().slice(-4)}`;
    }
  }
}

/**
 * Map raw User row to safe CustomerProfile
 */
export function formatCustomerProfile(user: User): CustomerProfile {
  const displayId = getCustomerDisplayId(user);
  const username = user.username || (user.email ? user.email.split('@')[0] : null);

  return {
    id: user.id,
    display_id: displayId,
    username: username || null,
    name: user.name || user.first_name || (username ? `@${username}` : 'Pelanggan'),
    email: user.email || null,
    phone: user.phone || null,
    telegram_id: user.telegram_id || null,
    avatar_url: user.avatar_url || null,
    role: user.role || 'buyer',
    balance: Number(user.balance || 0),
    membership_tier: user.membership_tier || 'free',
    membership_expires_at: user.membership_expires_at
      ? new Date(user.membership_expires_at).toISOString()
      : null,
    created_at: new Date(user.created_at).toISOString(),
  };
}

/**
 * Fetch customer by User UUID
 */
export async function getCustomerById(id: string): Promise<User | null> {
  const res = await query<User>('SELECT * FROM public.users WHERE id = $1 LIMIT 1', [id]);
  return res.rows[0] || null;
}

/**
 * Register a new customer via Email or Phone Number
 */
export async function registerCustomer(params: {
  identifier: string;
  password: string;
  name?: string;
}): Promise<User> {
  const { identifier, password, name } = params;

  if (!password || password.length < 6) {
    throw new Error('Password minimal harus terdiri dari 6 karakter.');
  }

  const parsed = parseIdentifier(identifier);
  const cleanName = name ? name.trim() : null;
  const passwordHash = hashPassword(password);

  // Check if identifier already in use
  if (parsed.type === 'email') {
    const existing = await query<User>(
      'SELECT id FROM public.users WHERE email = $1 LIMIT 1',
      [parsed.value]
    );
    if (existing.rows.length > 0) {
      throw new Error('Email ini sudah terdaftar. Silakan login atau gunakan email lain.');
    }

    const username = await generateUniqueUsername(parsed.value);
    const displayName = cleanName || username;

    const inserted = await query<User>(
      `INSERT INTO public.users (email, name, username, password_hash, role)
       VALUES ($1, $2, $3, $4, 'buyer')
       RETURNING *`,
      [parsed.value, displayName, username, passwordHash]
    );
    return inserted.rows[0];
  } else {
    const existing = await query<User>(
      'SELECT id FROM public.users WHERE phone = $1 LIMIT 1',
      [parsed.value]
    );
    if (existing.rows.length > 0) {
      throw new Error('Nomor HP ini sudah terdaftar. Silakan login atau gunakan nomor lain.');
    }

    const username = await generateUniqueUsername(cleanName || `user_${parsed.value.slice(-6)}`);
    const displayName = cleanName || username;

    const inserted = await query<User>(
      `INSERT INTO public.users (phone, name, username, password_hash, role)
       VALUES ($1, $2, $3, $4, 'buyer')
       RETURNING *`,
      [parsed.value, displayName, username, passwordHash]
    );
    return inserted.rows[0];
  }
}

/**
 * Login customer via Email or Phone Number + Password
 */
export async function loginCustomer(params: {
  identifier: string;
  password: string;
}): Promise<User> {
  const { identifier, password } = params;

  if (!identifier || !password) {
    throw new Error('Email/No. HP dan password wajib diisi.');
  }

  const parsed = parseIdentifier(identifier);

  const res =
    parsed.type === 'email'
      ? await query<User>('SELECT * FROM public.users WHERE email = $1 LIMIT 1', [parsed.value])
      : await query<User>('SELECT * FROM public.users WHERE phone = $1 LIMIT 1', [parsed.value]);

  if (res.rows.length === 0) {
    throw new Error('Akun dengan email atau nomor HP tersebut tidak ditemukan.');
  }

  const user = res.rows[0];

  if (!user.password_hash) {
    if (user.google_id) {
      throw new Error('Akun ini terdaftar melalui Akun Google. Silakan klik tombol "Masuk dengan Google".');
    }
    throw new Error('Akun belum memiliki password. Silakan reset password atau hubungi CS.');
  }

  const isValid = verifyPassword(password, user.password_hash);
  if (!isValid) {
    throw new Error('Password yang Anda masukkan salah. Silakan coba lagi.');
  }

  return user;
}

/**
 * Handle Google OAuth User: Find by google_id or email, link, or register
 */
export async function findOrCreateGoogleCustomer(params: {
  googleId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}): Promise<User> {
  const { googleId, email, name, avatarUrl } = params;
  const cleanEmail = email.toLowerCase().trim();
  const cleanName = name ? name.trim() : null;

  // 1. Try finding by google_id
  const byGoogle = await query<User>(
    'SELECT * FROM public.users WHERE google_id = $1 LIMIT 1',
    [googleId]
  );
  if (byGoogle.rows.length > 0) {
    const user = byGoogle.rows[0];
    let needsUpdate = false;
    let newUsername = user.username;

    if (!newUsername) {
      newUsername = await generateUniqueUsername(cleanEmail, user.id);
      needsUpdate = true;
    }

    if (avatarUrl && avatarUrl !== user.avatar_url) {
      needsUpdate = true;
    }

    if (needsUpdate) {
      await query(
        `UPDATE public.users
         SET avatar_url = COALESCE($1, avatar_url),
             username = COALESCE(username, $2),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [avatarUrl || null, newUsername, user.id]
      ).catch(() => {});
      user.username = newUsername;
    }
    return user;
  }

  // 2. Try finding by email and link google_id
  const byEmail = await query<User>(
    'SELECT * FROM public.users WHERE email = $1 LIMIT 1',
    [cleanEmail]
  );
  if (byEmail.rows.length > 0) {
    const user = byEmail.rows[0];
    const username = user.username || (await generateUniqueUsername(cleanEmail, user.id));

    const updated = await query<User>(
      `UPDATE public.users
       SET google_id = $1,
           password_hash = CASE WHEN google_id IS NULL THEN NULL ELSE password_hash END,
           avatar_url = COALESCE(avatar_url, $2),
           name = COALESCE(name, $3),
           username = COALESCE(username, $4),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [googleId, avatarUrl || null, cleanName, username, user.id]
    );
    return updated.rows[0] || user;
  }

  // 3. Create fresh customer account
  const username = await generateUniqueUsername(cleanEmail);
  const displayName = cleanName || username;

  const inserted = await query<User>(
    `INSERT INTO public.users (google_id, email, name, username, avatar_url, role)
     VALUES ($1, $2, $3, $4, $5, 'buyer')
     RETURNING *`,
    [googleId, cleanEmail, displayName, username, avatarUrl || null]
  );

  if (!inserted.rows[0]) {
    throw new Error('Gagal menyimpan data pengguna Google ke database.');
  }

  return inserted.rows[0];
}

/**
 * Extract authenticated customer from incoming HTTP Request
 */
export async function getCustomerFromRequest(req: Request): Promise<User | null> {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(new RegExp(`(?:^|; )${CUSTOMER_COOKIE_NAME}=([^;]*)`));
    const token = match ? decodeURIComponent(match[1]) : null;

    if (!token) {
      // Also accept Authorization: Bearer <token>
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const bearerToken = authHeader.substring(7).trim();
        const payload = verifyCustomerToken(bearerToken);
        if (payload?.sub) {
          return await getCustomerById(payload.sub);
        }
      }
      return null;
    }

    const payload = verifyCustomerToken(token);
    if (!payload?.sub) return null;

    return await getCustomerById(payload.sub);
  } catch {
    return null;
  }
}

/**
 * Ensure customer user exists by email or phone, or create a guest buyer account
 */
export async function ensureCustomerUser(params: {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}): Promise<User> {
  const cleanEmail = params.email ? params.email.trim().toLowerCase() : null;
  let cleanPhone: string | null = null;
  if (params.phone) {
    try {
      const parsed = parseIdentifier(params.phone);
      cleanPhone = parsed.value;
    } catch {
      cleanPhone = params.phone.replace(/\D/g, '');
    }
  }
  const cleanName = params.name ? params.name.trim() : null;

  // 1. Search by email
  if (cleanEmail) {
    const res = await query<User>('SELECT * FROM public.users WHERE email = $1 LIMIT 1', [cleanEmail]);
    if (res.rows.length > 0) return res.rows[0];
  }

  // 2. Search by phone
  if (cleanPhone) {
    const res = await query<User>('SELECT * FROM public.users WHERE phone = $1 LIMIT 1', [cleanPhone]);
    if (res.rows.length > 0) return res.rows[0];
  }

  // 3. Create fresh buyer
  const insertRes = await query<User>(
    `INSERT INTO public.users (email, phone, name, role)
     VALUES ($1, $2, $3, 'buyer')
     RETURNING *`,
    [cleanEmail, cleanPhone, cleanName]
  );
  return insertRes.rows[0];
}

/**
 * Resolves the trusted public origin/base URL of the application.
 */
export function getRequestBaseUrl(req?: Request | { headers: Headers }): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    try {
      const parsed = new URL(process.env.GOOGLE_REDIRECT_URI);
      return parsed.origin;
    } catch {
      // ignore
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (appUrl && !appUrl.includes('0.0.0.0')) {
    return appUrl.replace(/\/$/, '');
  }

  if (req) {
    const host = req.headers.get('host');
    if (host && (host.startsWith('localhost:') || host === 'localhost' || host.startsWith('127.0.0.1'))) {
      return `http://${host}`;
    }
  }

  return 'https://store.dafung.web.id';
}

