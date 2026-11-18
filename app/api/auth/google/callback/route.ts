import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  findOrCreateGoogleCustomer,
  signCustomerToken,
  CUSTOMER_COOKIE_NAME,
  TOKEN_EXPIRY_DAYS,
  getRequestBaseUrl,
} from '@/lib/customer-auth';

const OAUTH_STATE_COOKIE = 'dafung_oauth_state';

function safeEqualStrings(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const baseUrl = getRequestBaseUrl(req);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  let returnTo = '/';
  let stateNonce = '';

  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      if (
        decoded.returnTo &&
        typeof decoded.returnTo === 'string' &&
        decoded.returnTo.startsWith('/') &&
        !decoded.returnTo.startsWith('//')
      ) {
        returnTo = decoded.returnTo;
      }
      if (typeof decoded.nonce === 'string') {
        stateNonce = decoded.nonce;
      }
    } catch {
      // fallback to '/'
    }
  }

  const clearStateAndRedirect = (url: string) => {
    const res = NextResponse.redirect(url);
    res.cookies.delete(OAUTH_STATE_COOKIE);
    return res;
  };

  if (error || !code) {
    const errorMsg = encodeURIComponent(error || 'Google login dibatalkan.');
    return clearStateAndRedirect(`${baseUrl}${returnTo}?auth_error=${errorMsg}`);
  }

  // Verify CSRF state nonce against HttpOnly cookie
  const cookieNonce = req.cookies.get(OAUTH_STATE_COOKIE)?.value || '';
  if (!cookieNonce || !stateNonce || !safeEqualStrings(cookieNonce, stateNonce)) {
    console.error('[Google OAuth] CSRF state nonce mismatch rejected');
    return clearStateAndRedirect(
      `${baseUrl}${returnTo}?auth_error=${encodeURIComponent(
        'Sesi login Google tidak valid atau telah kedaluwarsa. Silakan coba lagi.'
      )}`
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return clearStateAndRedirect(
      `${baseUrl}${returnTo}?auth_error=${encodeURIComponent(
        'Kredensial Google OAuth server belum lengkap.'
      )}`
    );
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

  try {
    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(8000),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[Google OAuth] Token exchange error:', tokenData);
      return clearStateAndRedirect(
        `${baseUrl}${returnTo}?auth_error=${encodeURIComponent('Gagal verifikasi token Google.')}`
      );
    }

    // 2. Fetch user profile from Google API
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      signal: AbortSignal.timeout(8000),
    });

    const googleUser = await userinfoResponse.json();
    if (!userinfoResponse.ok || !googleUser.id || !googleUser.email) {
      console.error('[Google OAuth] Userinfo fetch error:', googleUser);
      return clearStateAndRedirect(
        `${baseUrl}${returnTo}?auth_error=${encodeURIComponent('Gagal membaca profil Akun Google.')}`
      );
    }

    if (googleUser.verified_email !== true) {
      console.error('[Google OAuth] Rejected unverified Google email:', googleUser.email);
      return clearStateAndRedirect(
        `${baseUrl}${returnTo}?auth_error=${encodeURIComponent(
          'Email akun Google Anda belum terverifikasi.'
        )}`
      );
    }

    // 3. Find or create user in public.users
    const user = await findOrCreateGoogleCustomer({
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name || googleUser.given_name || undefined,
      avatarUrl: googleUser.picture || undefined,
    });

    // 4. Sign session token & set cookie
    const token = signCustomerToken(user);
    const redirectUrl = `${baseUrl}${returnTo}${returnTo.includes('?') ? '&' : '?'}auth=success`;
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.delete(OAUTH_STATE_COOKIE);
    response.cookies.set({
      name: CUSTOMER_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_EXPIRY_DAYS * 24 * 3600,
    });

    return response;
  } catch (err: unknown) {
    console.error('[Google OAuth Callback Exception]:', err);
    return clearStateAndRedirect(
      `${baseUrl}${returnTo}?auth_error=${encodeURIComponent(
        'Terjadi kesalahan sistem saat memproses login Google.'
      )}`
    );
  }
}
