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
    const mediaObj = (body.media || body.file) as
      | { name?: string; content?: string; isPhoto?: boolean }
      | undefined;

    if (!credentials && (!mediaObj || !mediaObj.content)) {
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
      `SELECT o.*, COALESCE(u.telegram_id, '') as telegram_id, COALESCE(p.name, 'Produk Khusus') as product_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN products p ON o.product_id = p.id
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

    const storedCredential = mediaObj?.name
      ? `[MEDIA: ${mediaObj.name}] ${credentials || 'Dikirim via lampiran media'}`
      : credentials;
    const encryptedKey = encrypt(storedCredential);

    // 2. Send delivery to Telegram Buyer
    let sentToTelegram = false;
    let deliveredMediaMeta: {
      type: 'photo' | 'document' | 'video' | 'audio' | 'animation';
      fileId: string;
      fileName: string;
      mimeType: string;
    } | null = null;

    const deliveryInlineKeyboard = [
      [
        { text: '📩 Riwayat Pesanan', callback_data: 'menu_orders' },
        { text: '🛍️ Beli Produk Baru', callback_data: 'menu_products' },
      ],
      [{ text: '🔙 Menu Utama', callback_data: 'menu_main' }],
    ];

    if (mediaObj?.content && token && buyerChatId && buyerChatId !== 'Guest') {
      const fileName = mediaObj.name || (mediaObj.isPhoto ? `${orderCode}_voucher.jpg` : `${orderCode}_kredensial.txt`);
      let fileBuffer: Buffer;
      if (mediaObj.content.startsWith('data:') && mediaObj.content.includes('base64,')) {
        const base64Data = mediaObj.content.split('base64,')[1];
        fileBuffer = Buffer.from(base64Data, 'base64');
      } else {
        fileBuffer = Buffer.from(mediaObj.content, 'base64');
        if (fileBuffer.length === 0) {
          fileBuffer = Buffer.from(mediaObj.content, 'utf-8');
        }
      }

      const isPhoto = Boolean(
        mediaObj.isPhoto ||
        /\.(jpe?g|png|webp|gif)$/i.test(fileName)
      );

      const caption =
        `🎉 <b>PESANAN ANDA TELAH SELESAI!</b>\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `📦 <b>Produk:</b> ${escapeHtml(order.product_name)}\n` +
        `🆔 <b>Kode Order:</b> <code>${escapeHtml(order.order_code)}</code>\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        (credentials ? `🔑 <b>Kredensial / Petunjuk:</b>\n<code>${escapeHtml(credentials)}</code>\n\n` : '') +
        `📎 <i>Lampiran akun digital terlampir di atas. Simpan baik-baik!</i>\n` +
        `<i>Terima kasih telah berbelanja di DaFung Hub!</i>`;

      const formData = new FormData();
      formData.append('chat_id', buyerChatId);
      formData.append('caption', caption);
      formData.append('parse_mode', 'HTML');

      const mimeType = isPhoto ? 'image/jpeg' : 'application/octet-stream';
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });

      if (isPhoto) {
        formData.append('photo', blob, fileName);
      } else {
        formData.append('document', blob, fileName);
      }

      formData.append(
        'reply_markup',
        JSON.stringify({
          inline_keyboard: deliveryInlineKeyboard,
        })
      );

      const endpoint = isPhoto ? 'sendPhoto' : 'sendDocument';
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/${endpoint}`, {
        method: 'POST',
        body: formData,
      });
      const tgJson = await tgRes.json().catch(() => null);
      sentToTelegram = Boolean(tgJson?.ok);

      if (tgJson?.ok && tgJson?.result) {
        const resMsg = tgJson.result as {
          document?: { file_id?: string; file_name?: string; mime_type?: string };
          animation?: { file_id?: string; file_name?: string; mime_type?: string };
          video?: { file_id?: string; file_name?: string; mime_type?: string };
          audio?: { file_id?: string; file_name?: string; mime_type?: string };
          photo?: Array<{ file_id?: string }>;
        };
        if (isPhoto && Array.isArray(resMsg.photo) && resMsg.photo.length > 0) {
          const largest = resMsg.photo[resMsg.photo.length - 1];
          if (largest?.file_id) {
            deliveredMediaMeta = {
              type: 'photo',
              fileId: largest.file_id,
              fileName,
              mimeType,
            };
          }
        } else if (resMsg.document?.file_id) {
          deliveredMediaMeta = {
            type: 'document',
            fileId: resMsg.document.file_id,
            fileName: resMsg.document.file_name || fileName,
            mimeType: resMsg.document.mime_type || mimeType,
          };
        } else if (resMsg.animation?.file_id) {
          deliveredMediaMeta = {
            type: 'animation',
            fileId: resMsg.animation.file_id,
            fileName: resMsg.animation.file_name || fileName,
            mimeType: resMsg.animation.mime_type || mimeType,
          };
        } else if (resMsg.video?.file_id) {
          deliveredMediaMeta = {
            type: 'video',
            fileId: resMsg.video.file_id,
            fileName: resMsg.video.file_name || fileName,
            mimeType: resMsg.video.mime_type || mimeType,
          };
        } else if (resMsg.audio?.file_id) {
          deliveredMediaMeta = {
            type: 'audio',
            fileId: resMsg.audio.file_id,
            fileName: resMsg.audio.file_name || fileName,
            mimeType: resMsg.audio.mime_type || mimeType,
          };
        }
      }
    } else if (credentials && buyerChatId && buyerChatId !== 'Guest') {
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
          inline_keyboard: deliveryInlineKeyboard,
        },
      });
      sentToTelegram = Boolean(tgRes.ok);
    }

    // 3. Update Order in DB
    if (deliveredMediaMeta) {
      await query(
        `UPDATE orders
         SET payment_status = 'paid',
             fulfillment_status = 'delivered',
             credential_encrypted = $1,
             delivered_at = CURRENT_TIMESTAMP,
             invoice_data = jsonb_set(
               COALESCE(invoice_data::jsonb, '{}'::jsonb),
               '{delivered_media}',
               $3::jsonb
             )
         WHERE id = $2`,
        [encryptedKey, order.id, JSON.stringify(deliveredMediaMeta)]
      );
    } else {
      await query(
        `UPDATE orders
         SET payment_status = 'paid',
             fulfillment_status = 'delivered',
             credential_encrypted = $1,
             delivered_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [encryptedKey, order.id]
      );
    }

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
