import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestBaseUrl } from '@/lib/customer-auth';

const OAUTH_STATE_COOKIE = 'dafung_oauth_state';

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Fitur Google Login belum aktif. Silakan tambahkan GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET di pengaturan environment .env',
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawReturnTo = searchParams.get('returnTo') || '/';
  // Prevent protocol-relative open redirects like //evil.com
  const returnTo =
    rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/';

  // Construct OAuth callback redirect URI
  const baseUrl = getRequestBaseUrl(req);
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

  // Generate cryptographic CSRF nonce bound to HttpOnly cookie
  const nonce = crypto.randomBytes(32).toString('base64url');
  const state = Buffer.from(JSON.stringify({ returnTo, nonce })).toString('base64url');

  const scope = encodeURIComponent('openid email profile');
  const googleAuthUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `prompt=select_account&` +
    `state=${state}`;

  const response = NextResponse.redirect(googleAuthUrl);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: nonce,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
