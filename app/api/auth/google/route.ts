import { NextRequest, NextResponse } from 'next/server';
import { getRequestBaseUrl } from '@/lib/customer-auth';

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
  const returnTo = searchParams.get('returnTo') || '/';

  // Construct OAuth callback redirect URI
  const baseUrl = getRequestBaseUrl(req);
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/auth/google/callback`;

  // Encode state with returnTo
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');

  const scope = encodeURIComponent('openid email profile');
  const googleAuthUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `response_type=code&` +
    `scope=${scope}&` +
    `prompt=select_account&` +
    `state=${state}`;

  return NextResponse.redirect(googleAuthUrl);
}
