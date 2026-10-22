import { NextResponse } from 'next/server';
import { query, Order } from '@/lib/db';
import { encrypt } from '@/lib/encrypt';
import { verifyAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { sendTelegramApi } from '@/lib/broadcast';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function POST(
  req: Request,
  context: { params: Promise<{ code: string }> }
) {
  if (!verifyAdminRequest(req)) {
    return unauthorizedResponse();
  }

  const { code } = await context.params;
  const orderCode = decodeURIComponent(code).trim();

  try {
    const body = await req.json().catch(() => ({}));
    const credentials = (body.credentials || '').trim();
    const file = body.file as { name?: string; content?: string } | undefined;

    if (!credentials && (!file || !file.content)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Kredensial atau berkas akun tidak boleh kosong.',
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Find Order and Buyer
    const orderRes = await query<Order & { telegram_id: string; product_name: string }>(
      `SELECT o.*, u.telegram_id, p.name as product_name
       FROM orders o
       JOIN users u ON o.user_id = u.id
       JOIN products p ON o.product_id = p.id
       WHERE o.order_code = $1 LIMIT 1`,
      [orderCode]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Pesanan dengan kode "${orderCode}" tidak ditemukan.`,
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const order = orderRes.rows[0];
    const buyerChatId = order.telegram_id;
    const token = process.env.TELEGRAM_BOT_TOKEN;

    const storedCredential = file?.name
      ? `[FILE: ${file.name}] ${credentials || 'Dikirim via berkas'}`
      : credentials;
    const encryptedKey = encrypt(storedCredential);

    // 2. Send delivery to Telegram Buyer
    let sentToTelegram = false;

    if (file?.content && token) {
      // Send as document file (.txt or specified filename)
      const fileName = file.name || `${orderCode}_kredensial.txt`;
      let fileBuffer: Buffer;
      if (file.content.startsWith('data:') && file.content.includes('base64,')) {
        const base64Data = file.content.split('base64,')[1];
        fileBuffer = Buffer.from(base64Data, 'base64');
      } else {
        fileBuffer = Buffer.from(file.content, 'utf-8');
      }

      const caption =
        `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
        `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        (credentials ? `📝 <b>Catatan / Petunjuk:</b>\n<code>${escapeHtml(credentials)}</code>\n\n` : '') +
        `📎 <i>Kredensial lengkap terlampir pada dokumen di atas. Simpan baik-baik!</i>\n` +
        `<i>Terima kasih telah berbelanja di DaFung Hub!</i>`;

      const formData = new FormData();
      formData.append('chat_id', buyerChatId);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: 'application/octet-stream' });
      formData.append('document', blob, fileName);

      formData.append(
        'reply_markup',
        JSON.stringify({
          inline_keyboard: [
            [{ text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        })
      );

      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: formData,
      });
      const tgJson = await tgRes.json().catch(() => null);
      sentToTelegram = Boolean(tgJson?.ok);
    } else {
      // Send as clean text message
      const textMessage =
        `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
        `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔑 <b>Kredensial Akun Anda:</b>\n` +
        `<code>${escapeHtml(credentials)}</code>\n\n` +
        `📌 <i>Simpan kredensial ini baik-baik. Garansi berlaku sesuai ketentuan produk. Terima kasih telah berbelanja di DaFung Hub!</i>`;

      const tgRes = await sendTelegramApi('sendMessage', {
        chat_id: buyerChatId,
        text: textMessage,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' }],
            [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
          ],
        },
      });
      sentToTelegram = Boolean(tgRes.ok);
    }

    // 3. Update Order in DB
    await query(
      `UPDATE orders
       SET payment_status = 'paid',
           fulfillment_status = 'delivered',
           credential_encrypted = $1,
           delivered_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [encryptedKey, order.id]
    );

    return NextResponse.json(
      {
        success: true,
        message: `Pesanan ${orderCode} berhasil dipenuhi dan dikirim ke pelanggan.`,
        sentToTelegram,
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Gagal memenuhi pesanan.',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
