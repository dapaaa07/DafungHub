'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, Home, MessageCircle, RotateCcw, Send } from 'lucide-react';
import Footer from '@/components/Footer';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[Dafung Hub Error Boundary]:', error);
  }, [error]);

  const waUrl = `https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
    `Halo CS Dafung Hub, saya mengalami kendala saat membuka website.${error?.digest ? ` (Kode: ${error.digest})` : ''}`
  )}`;

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] bg-[#F8F9FA] text-[#121212]">
      <main className="flex-1 flex items-center justify-center px-4 py-14 sm:py-20">
        <div className="w-full max-w-xl bg-white rounded-3xl border border-gray-200/90 shadow-sm p-7 sm:p-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-extrabold tracking-wide uppercase">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Kendala Sistem Sementara</span>
          </div>

          <div className="space-y-2.5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#121212] text-[#FFDE00] flex items-center justify-center shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#121212] tracking-tight pt-1">
              Terjadi kesalahan saat memuat halaman
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              Permintaan Anda tidak dapat diproses saat ini karena gangguan sementara pada server atau koneksi. Silakan coba muat ulang halaman.
            </p>
            {error?.digest && (
              <p className="inline-block px-3 py-1 rounded-lg bg-gray-100 text-[11px] font-mono text-gray-600">
                Kode Referensi: {error.digest}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => reset()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-[#FFDE00]" />
              <span>Coba Lagi</span>
            </button>
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#121212] text-xs sm:text-sm font-bold transition-all"
            >
              <Home className="w-4 h-4" />
              <span>Kembali ke Beranda</span>
            </Link>
          </div>

          <div className="pt-5 border-t border-gray-100 space-y-3">
            <p className="text-xs text-gray-500">
              Masih terkendala atau butuh order cepat? Gunakan jalur resmi berikut:
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900 text-xs font-bold transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-[#3AA8E8]" />
                <span>Order via Bot Telegram</span>
              </a>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 text-xs font-bold transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                <span>Hubungi CS WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
