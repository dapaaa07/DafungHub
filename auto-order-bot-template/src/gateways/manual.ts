import { config } from '../../config/bot.config';

export function getManualPaymentInstructions(orderCode: string, amount: number): string {
  const { bankName, accountNumber, accountHolder, qrisImageUrl } = config.gateways.manual;

  let text =
    `💳 <b>PEMBAYARAN MANUAL TRANSFER / QRIS</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n` +
    `• <b>Kode Order:</b> <code>${orderCode}</code>\n` +
    `• <b>Total Transfer:</b> <b>Rp ${amount.toLocaleString('id-ID')}</b>\n` +
    `• <b>Bank / E-Wallet:</b> ${bankName}\n` +
    `• <b>Nomor Rekening:</b> <code>${accountNumber}</code>\n` +
    `• <b>Atas Nama:</b> ${accountHolder}\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `📌 <i>Setelah transfer, kirimkan bukti transfer ke admin via WhatsApp dengan menyertakan kode order di atas untuk konfirmasi instan!</i>`;

  if (qrisImageUrl) {
    text += `\n\n🖼️ <b>QRIS Statis:</b> ${qrisImageUrl}`;
  }

  return text;
}
