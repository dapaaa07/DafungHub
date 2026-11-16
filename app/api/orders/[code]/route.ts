import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { decrypt } from '@/lib/encrypt';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const orderCode = code?.trim();

    if (!orderCode) {
      return NextResponse.json({ success: false, error: 'Kode order tidak valid.' }, { status: 400 });
    }

    const orderRes = await query<{
      id: string;
      order_code: string;
      user_id: string;
      product_id: string;
      payment_status: 'unpaid' | 'paid' | 'expired';
      fulfillment_status: 'pending' | 'processing' | 'delivered';
      invoice_data: unknown;
      credential_encrypted: string | null;
      created_at: string;
      updated_at: string;
      delivered_at: string | null;
      product_name: string;
      product_price: number;
      product_description?: string;
    }>(
      `SELECT o.*, p.name as product_name, p.price as product_price, p.description as product_description
       FROM orders o
       JOIN products p ON o.product_id = p.id
       WHERE o.order_code = $1
       LIMIT 1`,
      [orderCode]
    );

    if (orderRes.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Pesanan tidak ditemukan.' }, { status: 404 });
    }

    let order = orderRes.rows[0];
    const invData =
      typeof order.invoice_data === 'string'
        ? JSON.parse(order.invoice_data || '{}')
        : ((order.invoice_data || {}) as Record<string, unknown>);

    // If order is still unpaid, check ShopeePay payment status on the fly
    if (order.payment_status === 'unpaid') {
      const orderGateway = String(invData.gateway || process.env.PAYMENT_GATEWAY || 'shopeepay').toLowerCase();
      if (orderGateway === 'shopeepay' && invData.token) {
        try {
          const { checkShopeePayPayment } = await import('@/lib/shopeepay');
          const checkAmount = Number(invData.payable_amount || order.product_price);
          const checkResult = await checkShopeePayPayment({
            token: String(invData.token),
            orderCode: order.order_code,
            amount: checkAmount,
            orderCreatedAt: order.created_at,
          });

          if (checkResult.paid) {
            const { processOrderPayment } = await import('@/lib/fulfillment');
            const { bot } = await import('@/bot/handler');
            const txMeta = checkResult.transaction && typeof checkResult.transaction === 'object'
              ? (checkResult.transaction as Record<string, unknown>)
              : undefined;

            await processOrderPayment(order.order_code, bot, txMeta);

            // Re-fetch fresh order status
            const freshRes = await query<typeof order>(
              `SELECT o.*, p.name as product_name, p.price as product_price, p.description as product_description
               FROM orders o
               JOIN products p ON o.product_id = p.id
               WHERE o.order_code = $1 LIMIT 1`,
              [orderCode]
            );
            if (freshRes.rows.length > 0) {
              order = freshRes.rows[0];
            }
          }
        } catch (checkErr) {
          console.warn('[Order Poll] Auto-check error:', checkErr);
        }
      }
    }

    // Decrypt credentials if delivered
    let rawCredentials: string | null = null;
    let cleanCredentials: string | null = null;
    let credentialsNote: string | null = null;

    if (order.fulfillment_status === 'delivered' && order.credential_encrypted) {
      try {
        rawCredentials = decrypt(order.credential_encrypted);
        cleanCredentials = rawCredentials;
        if (cleanCredentials) {
          const fileTagMatch = cleanCredentials.match(/^\[(?:FILE|MEDIA):[^\]]+\]\s*/i);
          if (fileTagMatch) {
            const rest = cleanCredentials.slice(fileTagMatch[0].length).trim();
            credentialsNote = rest.length > 0 ? rest : null;
          } else {
            credentialsNote = cleanCredentials;
          }
        }
      } catch (decErr) {
        console.error('[Order Poll] Credential decryption error:', decErr);
        cleanCredentials = '⚠️ Gagal mendekripsi kredensial. Silakan hubungi Customer Support.';
      }
    }

    // Resolve delivered media if present
    let deliveredMedia: {
      type: string;
      fileName: string;
      mimeType: string;
      fileUrl: string;
      downloadUrl: string;
      fileSize: number | null;
      isPhoto: boolean;
      isText: boolean;
      textContent: string | null;
    } | null = null;

    const rawMedia = invData.delivered_media as
      | {
          type?: string;
          fileId?: string;
          fileName?: string;
          mimeType?: string;
        }
      | undefined;

    if (order.fulfillment_status === 'delivered' && rawMedia?.fileId) {
      try {
        const { getDeliveredTelegramMedia } = await import('@/lib/telegram-media');
        const mediaResult = await getDeliveredTelegramMedia(
          rawMedia.fileId,
          rawMedia.fileName,
          rawMedia.mimeType
        );

        deliveredMedia = {
          type: rawMedia.type || 'document',
          fileName: mediaResult?.fileName || rawMedia.fileName || 'lampiran',
          mimeType: mediaResult?.mimeType || rawMedia.mimeType || 'application/octet-stream',
          fileUrl: `/api/orders/${order.order_code}/media`,
          downloadUrl: `/api/orders/${order.order_code}/media?download=1`,
          fileSize: mediaResult?.fileSize || null,
          isPhoto: mediaResult?.isPhoto ?? Boolean(rawMedia.type === 'photo' || /\.(jpe?g|png|webp|gif)$/i.test(rawMedia.fileName || '')),
          isText: mediaResult?.isText ?? Boolean(/\.(txt|json|csv|log)$/i.test(rawMedia.fileName || '')),
          textContent: mediaResult?.textContent || null,
        };

        // If credentials only had [FILE: ...] and we have text content from file, display the file's text content!
        if (deliveredMedia.isText && deliveredMedia.textContent) {
          cleanCredentials = deliveredMedia.textContent;
        } else if (credentialsNote) {
          cleanCredentials = credentialsNote;
        }
      } catch (mediaErr) {
        console.warn('[Order Media] Error resolving delivered media:', mediaErr);
      }
    }

    const payableAmount =
      typeof invData.payable_amount === 'number'
        ? invData.payable_amount
        : Number(order.product_price || 0);

    return NextResponse.json({
      success: true,
      order: {
        orderCode: order.order_code,
        productName: order.product_name,
        productDescription: order.product_description,
        paymentStatus: order.payment_status,
        fulfillmentStatus: order.fulfillment_status,
        paymentMethod: invData.payment_method || 'qris',
        gateway: invData.gateway || 'shopeepay',
        payableAmount,
        qrCodeUrl: invData.qr_code_url || null,
        qrString: invData.qr_string || null,
        checkoutUrl: invData.checkout_url || null,
        uniqueCode: invData.unique_code || 0,
        createdAt: order.created_at,
        deliveredAt: order.delivered_at,
        credentials: cleanCredentials,
        credentialsNote,
        deliveredMedia,
        isDelivered: order.fulfillment_status === 'delivered',
        isPaid: order.payment_status === 'paid',
        isExpired: order.payment_status === 'expired',
      },
    });
  } catch (error) {
    console.error('[/api/orders/[code]] Error:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Terjadi kesalahan sistem.' },
      { status: 500 }
    );
  }
}
