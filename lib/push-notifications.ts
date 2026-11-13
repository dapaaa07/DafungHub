import { query } from './db';

/**
 * Register an Expo Push Token for the admin device
 */
export async function registerAdminPushToken(token: string): Promise<void> {
  if (!token || typeof token !== 'string') return;
  const cleanToken = token.trim();
  if (!cleanToken) return;

  try {
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = 'admin_push_tokens' LIMIT 1`
    );

    let tokens: string[] = [];
    if (res.rows.length > 0 && res.rows[0].value) {
      try {
        tokens = JSON.parse(res.rows[0].value);
      } catch {
        tokens = [];
      }
    }

    if (!Array.isArray(tokens)) {
      tokens = [];
    }

    if (!tokens.includes(cleanToken)) {
      tokens.push(cleanToken);
      await query(
        `INSERT INTO bot_settings (key, value, updated_at)
         VALUES ('admin_push_tokens', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(tokens)]
      );
      console.log(`[Push Notification] Registered new admin push token: ${cleanToken}`);
    }
  } catch (err) {
    console.error('[Push Notification] Error registering token:', err);
  }
}

/**
 * Send real-time push notification to all registered admin devices via Expo Push Service
 */
export async function sendAdminPushNotification(data: {
  orderCode: string;
  productName: string;
  price: number;
  customerName: string;
  title?: string;
  body?: string;
}): Promise<void> {
  try {
    const res = await query<{ value: string }>(
      `SELECT value FROM bot_settings WHERE key = 'admin_push_tokens' LIMIT 1`
    );

    if (res.rows.length === 0 || !res.rows[0].value) return;

    let tokens: string[] = [];
    try {
      tokens = JSON.parse(res.rows[0].value);
    } catch {
      return;
    }

    if (!Array.isArray(tokens) || tokens.length === 0) return;

    const formattedPrice = `Rp ${Number(data.price || 0).toLocaleString('id-ID')}`;
    const title = data.title || '🔔 Pesanan Baru Masuk!';
    const body = data.body || `${data.productName} (${formattedPrice}) dari ${data.customerName}`;

    const messages = tokens.map((to) => ({
      to,
      sound: 'default',
      title,
      body,
      data: { orderCode: data.orderCode },
      priority: 'high',
      channelId: 'dafung-orders',
      _displayInForeground: true,
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json().catch(() => null);
    console.log('[Expo Push] Notification dispatched to Expo server:', result);
  } catch (err) {
    console.warn('[Expo Push] Error sending push notification:', err);
  }
}
