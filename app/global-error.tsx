'use client';

import { useEffect } from 'react';
import { AlertTriangle, MessageCircle, RotateCcw, Send } from 'lucide-react';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('[Dafung Hub Global Error]:', error);
  }, [error]);

  const waUrl = `https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
    `Halo CS Dafung Hub, website menampilkan gangguan kritis.${error?.digest ? ` (Kode: ${error.digest})` : ''}`
  )}`;

  return (
    <html lang="id">
      <body className="min-h-screen bg-[#F8F9FA] text-[#121212] antialiased flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl border border-gray-200 shadow-sm p-7 sm:p-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-extrabold tracking-wide uppercase">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Error 500 — Gangguan Server</span>
          </div>

          <div className="space-y-2.5">
            <h1 className="text-2xl font-black text-[#121212] tracking-tight">
              Dafung Hub sedang memulihkan koneksi
            </h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              Terjadi kendala tak terduga saat memuat aplikasi. Silakan muat ulang halaman atau lanjutkan transaksi melalui Bot Telegram resmi kami.
            </p>
            {error?.digest && (
              <p className="inline-block px-3 py-1 rounded-lg bg-gray-100 text-[11px] font-mono text-gray-600">
                Kode Referensi: {error.digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#FFDE00]" />
              <span>Muat Ulang</span>
            </button>
            <a
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] text-xs sm:text-sm font-extrabold shadow-sm transition-all"
            >
              <span>Ke Beranda</span>
            </a>
          </div>

          <div className="pt-5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <a
              href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-bold transition-colors"
            >
              <Send className="w-3.5 h-3.5 text-[#3AA8E8]" />
              <span>Bot Telegram</span>
            </a>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
              <span>Chat CS WhatsApp</span>
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
