import Link from 'next/link';
import { ArrowLeft, Compass, PackageCheck, Send, ShoppingBag, User as UserIcon } from 'lucide-react';
import Footer from '@/components/Footer';
import { TELEGRAM_BOT_USERNAME } from '@/lib/pricing';

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] bg-[#F8F9FA] text-[#121212]">
      <main className="flex-1 flex items-center justify-center px-4 py-14 sm:py-20">
        <div className="w-full max-w-xl bg-white rounded-3xl border border-gray-200/90 shadow-sm p-7 sm:p-10 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFDE00]/25 border border-[#FFDE00] text-[#121212] text-xs font-extrabold tracking-wide uppercase">
            <Compass className="w-3.5 h-3.5" />
            <span>Error 404 — Halaman Tidak Ditemukan</span>
          </div>

          <div className="space-y-2.5">
            <p className="text-6xl sm:text-7xl font-black tracking-tight text-[#121212] leading-none">
              404
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#121212] tracking-tight">
              Halaman yang Anda cari tidak tersedia
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              Tautan mungkin sudah berubah, dihapus, atau alamat URL yang dimasukkan kurang tepat. Silakan kembali ke beranda atau jelajahi katalog produk kami.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
            >
              <ArrowLeft className="w-4 h-4 text-[#FFDE00]" />
              <span>Kembali ke Beranda</span>
            </Link>
            <Link
              href="/#katalog"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] text-xs sm:text-sm font-extrabold shadow-sm transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Lihat Katalog Produk</span>
            </Link>
          </div>

          <div className="pt-5 border-t border-gray-100">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3">
              Akses Cepat
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/orders"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors"
              >
                <PackageCheck className="w-3.5 h-3.5 text-[#3AA8E8]" />
                <span>Riwayat Pesanan</span>
              </Link>
              <Link
                href="/account"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors"
              >
                <UserIcon className="w-3.5 h-3.5 text-gray-700" />
                <span>Akun & Saldo</span>
              </Link>
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700 transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-[#3AA8E8]" />
                <span>Bot Telegram</span>
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
