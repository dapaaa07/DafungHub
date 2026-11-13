import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const content = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
      if (content.startsWith('{')) {
        return JSON.parse(content);
      }
      // Check if base64 encoded
      const decoded = Buffer.from(content, 'base64').toString('utf8');
      return JSON.parse(decoded);
    }

    const saPath = path.resolve(process.cwd(), 'lib/firebase-service-account.json');
    if (fs.existsSync(saPath)) {
      return JSON.parse(fs.readFileSync(saPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[FCM] Error loading service account:', err);
  }
  return null;
}

/**
 * Get OAuth2 access token for Google Firebase FCM v1 API
 */
export async function getFcmAccessToken(): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);

  // Return cached token if valid for at least 5 more minutes
  if (cachedToken && cachedToken.expiresAt > now + 300) {
    return cachedToken.token;
  }

  const sa = loadServiceAccount();
  if (!sa || !sa.client_email || !sa.private_key || !sa.project_id) {
    return null;
  }

  try {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const signature = signer.sign(sa.private_key, 'base64url');

    const assertion = `${header}.${payload}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.warn('[FCM] Failed to get OAuth2 token:', data);
      return null;
    }

    cachedToken = {
      token: data.access_token,
      expiresAt: now + (data.expires_in || 3600),
    };

    return data.access_token;
  } catch (err) {
    console.error('[FCM] Error generating access token:', err);
    return null;
  }
}

/**
 * Send direct FCM v1 push notification to an Android device
 */
export async function sendFcmMessage(options: {
  token: string;
  title: string;
  body: string;
  orderCode?: string;
}): Promise<boolean> {
  const sa = loadServiceAccount();
  if (!sa?.project_id) return false;

  const accessToken = await getFcmAccessToken();
  if (!accessToken) return false;

  try {
    const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: options.token,
          notification: {
            title: options.title,
            body: options.body,
          },
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'dafung-orders',
              sound: 'default',
              default_vibrate_timings: true,
              default_light_settings: true,
              notification_priority: 'PRIORITY_MAX',
              visibility: 'PUBLIC',
            },
          },
          data: {
            orderCode: options.orderCode || '',
          },
        },
      }),
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`[FCM] Successfully sent push to ${options.token.substring(0, 15)}...:`, result.name);
      return true;
    } else {
      console.warn('[FCM] Failed to send push:', result);
      return false;
    }
  } catch (err) {
    console.error('[FCM] Network error sending push:', err);
    return false;
  }
}
