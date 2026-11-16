import { NextRequest, NextResponse } from 'next/server';
import {
  findOrCreateGoogleCustomer,
  signCustomerToken,
  CUSTOMER_COOKIE_NAME,
  TOKEN_EXPIRY_DAYS,
  getRequestBaseUrl,
} from '@/lib/customer-auth';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const baseUrl = getRequestBaseUrl(req);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  let returnTo = '/';
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      if (decoded.returnTo && typeof decoded.returnTo === 'string' && decoded.returnTo.startsWith('/')) {
        returnTo = decoded.returnTo;
      }
    } catch {
      // fallback to '/'
    }
  }

  if (error || !code) {
    const errorMsg = encodeURIComponent(error || 'Google login dibatalkan.');
    return NextResponse.redirect(`${baseUrl}${returnTo}?auth_error=${errorMsg}`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
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
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[Google OAuth] Token exchange error:', tokenData);
      return NextResponse.redirect(
        `${baseUrl}${returnTo}?auth_error=${encodeURIComponent('Gagal verifikasi token Google.')}`
      );
    }

    // 2. Fetch user profile from Google API
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userinfoResponse.json();
    if (!userinfoResponse.ok || !googleUser.id || !googleUser.email) {
      console.error('[Google OAuth] Userinfo fetch error:', googleUser);
      return NextResponse.redirect(
        `${baseUrl}${returnTo}?auth_error=${encodeURIComponent('Gagal membaca profil Akun Google.')}`
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
  } catch (err: any) {
    console.error('[Google OAuth Callback Exception]:', err);
    return NextResponse.redirect(
      `${baseUrl}${returnTo}?auth_error=${encodeURIComponent('Terjadi kesalahan saat memproses login Google.')}`
    );
  }
}
