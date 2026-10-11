'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { X, Send, MessageCircle, ShieldCheck, CheckCircle2, Clock } from 'lucide-react';
import { EnrichedProduct } from '@/lib/types';
import { formatRupiah, CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';

interface OrderModalProps {
  product: EnrichedProduct | null;
  onClose: () => void;
}

export default function OrderModal({ product, onClose }: OrderModalProps) {
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (product) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = 'auto';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [product, onClose]);

  if (!product) return null;

  const telegramUrl = `https://t.me/${TELEGRAM_BOT_USERNAME}?start=buy_${product.id}`;

  const waMessage = `Halo Admin Dafung Hub, saya ingin memesan produk digital:
- Produk: ${product.name}
- Durasi: ${product.durationText}
- Harga: ${formatRupiah(product.sellingPrice)}
- ID Produk: ${product.id}

Mohon panduan ketersediaan & metode pembayarannya. Terima kasih!`;

  const waUrl = `https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(waMessage)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header Ribbon with Close Button */}
        <div className="sticky top-0 z-20 bg-[#121212] text-white p-4 sm:p-5 flex items-center justify-between border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FFDE00]" />
            <span className="font-extrabold text-sm tracking-wide text-gray-200">
              Konfirmasi Pemesanan
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 text-white flex items-center justify-center transition-all border border-white/20 shrink-0 focus:outline-none focus:ring-2 focus:ring-[#FFDE00]"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Product Overview Box */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-[#F8F9FA] border border-gray-200 flex items-center gap-3.5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white border border-gray-200 p-2 flex items-center justify-center shrink-0 shadow-sm">
              {product.logoUrl ? (
                <Image
                  src={product.logoUrl}
                  alt={product.platformName}
                  width={56}
                  height={56}
                  className="object-contain max-h-12 w-auto"
                />
              ) : (
                <span className="text-2xl sm:text-3xl">{product.platformIcon}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase block">
                {product.platformName}
              </span>
              <h4 className="text-base sm:text-lg font-extrabold text-[#121212] truncate">
                {product.name}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded-md bg-[#121212] text-white text-[10px] sm:text-[11px] font-bold">
                  {product.durationText}
                </span>
                <span className="text-[11px] text-gray-500 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#3AA8E8]" /> {product.warrantyText}
                </span>
              </div>
            </div>
          </div>

          {/* Price Summary */}
          <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-yellow-50 border border-yellow-200">
            <div>
              <span className="text-[11px] text-yellow-800 font-semibold block">Total Harga Paket</span>
              <span className="text-xl sm:text-2xl font-black text-[#121212]">
                {formatRupiah(product.sellingPrice)}
              </span>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold bg-[#FFDE00] text-[#121212]">
              ⚡ Garansi Aktif
            </span>
          </div>

          {/* Product Description / Delivery Guidelines */}
          {product.description && (
            <div className="space-y-1.5 text-xs text-gray-600 bg-gray-50 p-3 sm:p-3.5 rounded-xl border border-gray-100 max-h-28 overflow-y-auto">
              <span className="font-bold text-gray-800 block text-[10px] sm:text-[11px] uppercase">
                Detail & Catatan Paket:
              </span>
              <p className="whitespace-pre-line leading-relaxed text-gray-600 text-[11px] sm:text-xs">
                {product.description.trim()}
              </p>
            </div>
          )}

          {/* Ordering Options Notice */}
          <div className="text-center space-y-1">
            <h5 className="text-xs sm:text-sm font-extrabold text-[#121212]">
              Pilih Jalur Pemesanan Cepat
            </h5>
            <p className="text-[11px] text-gray-500">
              Pemesanan diproses instan melalui Bot Otomatis atau CS WhatsApp resmi Dafung Hub:
            </p>
          </div>

          {/* Dual Big CTA Buttons */}
          <div className="space-y-2.5">
            {/* Option 1: Telegram Bot (Dynamic Online vs Maintenance) */}
            {isOnline ? (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#121212] hover:bg-[#252525] text-white shadow-md hover:scale-[1.01] active:scale-98 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/10 flex items-center justify-center text-[#3AA8E8] group-hover:bg-[#FFDE00] group-hover:text-[#121212] transition-colors shrink-0">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                      <span>Pesan via Telegram Bot</span>
                      <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        🟢 Auto Order 24 Jam
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-300 truncate">
                      Otomatis terbit invoice QRIS & kirim akun instan
                    </div>
                  </div>
                </div>
                <span className="text-[#FFDE00] font-bold text-sm shrink-0 ml-2">
                  →
                </span>
              </a>
            ) : (
              <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed opacity-75">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 shrink-0">
                    <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5 flex-wrap text-gray-600">
                      <span>Pesan via Telegram Bot</span>
                      <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                        Sedang Maintenance
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      Layanan bot sedang dalam pemeliharaan sistem
                    </div>
                  </div>
                </div>
                <span className="text-gray-400 text-xs font-bold shrink-0 ml-2">
                  (Nonaktif)
                </span>
              </div>
            )}

            {/* Option 2: WhatsApp Admin */}
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] shadow-lg shadow-yellow-300/30 hover:scale-[1.01] active:scale-98 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-black/10 flex items-center justify-center text-[#121212] group-hover:bg-[#121212] group-hover:text-[#FFDE00] transition-colors shrink-0">
                  <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="text-left min-w-0">
                  <div className="font-extrabold text-xs sm:text-sm flex items-center gap-1.5 flex-wrap">
                    <span>Pesan via WhatsApp CS</span>
                    <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/10 text-[#121212]">
                      0812-9495-0241
                    </span>
                  </div>
                  <div className="text-[11px] text-yellow-900/80 truncate">
                    Konsultasi & dibantu langsung tim admin Dafung Hub
                  </div>
                </div>
              </div>
              <span className="text-[#121212] font-bold text-sm shrink-0 ml-2">
                →
              </span>
            </a>
          </div>

          {/* Secondary Mobile Close Button */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-black hover:bg-gray-50 active:bg-gray-100 text-xs font-bold transition-all text-center"
          >
            Tutup & Kembali ke Katalog
          </button>

          {/* Trust Guarantees Footer */}
          <div className="pt-1 flex items-center justify-center gap-3 text-[10px] sm:text-[11px] text-gray-500 font-medium">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Transaksi Terpercaya
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#3AA8E8]" /> Pengiriman Super Cepat
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
