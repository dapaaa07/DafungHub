'use client';

import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Clock,
  Compass,
  CreditCard,
  Gauge,
  Home,
  Lock,
  MessageCircle,
  PackageCheck,
  RotateCcw,
  Send,
  ServerCrash,
  ShieldAlert,
  ShoppingBag,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import Footer from '@/components/Footer';
import { useCustomerAuth } from '@/components/CustomerAuthContext';
import { getHttpError } from '@/lib/http-errors';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';

interface HttpErrorViewProps {
  statusCode: number;
  title?: string;
  description?: string;
  digest?: string;
  onRetry?: () => void;
}

function getStatusIcon(code: number) {
  switch (code) {
    case 400:
      return AlertCircle;
    case 401:
      return Lock;
    case 402:
      return CreditCard;
    case 403:
      return ShieldAlert;
    case 404:
      return Compass;
    case 405:
      return Ban;
    case 408:
    case 504:
      return Clock;
    case 429:
      return Gauge;
    case 500:
    case 502:
    case 503:
      return ServerCrash;
    default:
      return AlertTriangle;
  }
}

export default function HttpErrorView({
  statusCode,
  title,
  description,
  digest,
  onRetry,
}: HttpErrorViewProps) {
  const { openAuthModal } = useCustomerAuth();
  const def = getHttpError(statusCode);
  const Icon = getStatusIcon(def.code);

  const badgeStyle =
    def.tone === 'danger'
      ? 'bg-red-50 border-red-200 text-red-700'
      : def.tone === 'warning'
        ? 'bg-amber-50 border-amber-200 text-amber-800'
        : 'bg-[#FFDE00]/25 border-[#FFDE00] text-[#121212]';

  const waUrl = `https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
    `Halo CS Dafung Hub, saya mengalami Error ${def.code} (${def.label}) di website.${digest ? ` Kode: ${digest}` : ''}`
  )}`;

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-5rem)] bg-[#F8F9FA] text-[#121212]">
      <main className="flex-1 flex items-center justify-center px-4 py-14 sm:py-20">
        <div className="w-full max-w-xl bg-white rounded-3xl border border-gray-200/90 shadow-sm p-7 sm:p-10 text-center space-y-6">
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-extrabold tracking-wide uppercase ${badgeStyle}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span>{def.badge}</span>
          </div>

          <div className="space-y-2.5">
            <p className="text-6xl sm:text-7xl font-black tracking-tight text-[#121212] leading-none">
              {def.code}
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#121212] tracking-tight pt-1">
              {title || def.title}
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
              {description || def.description}
            </p>
            {digest && (
              <p className="inline-block px-3 py-1 rounded-lg bg-gray-100 text-[11px] font-mono text-gray-600">
                Kode Referensi: {digest}
              </p>
            )}
          </div>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
            {def.primaryAction === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                  <UserIcon className="w-4 h-4 text-[#FFDE00]" />
                  <span>Masuk / Daftar Akun</span>
                </button>
                <Link
                  href="/"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#121212] text-xs sm:text-sm font-bold transition-all"
                >
                  <Home className="w-4 h-4" />
                  <span>Kembali ke Beranda</span>
                </Link>
              </>
            )}

            {def.primaryAction === 'account' && (
              <>
                <Link
                  href="/account"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] text-xs sm:text-sm font-extrabold shadow-sm transition-all"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Kelola Saldo & Akun</span>
                </Link>
                <Link
                  href="/orders"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
                >
                  <PackageCheck className="w-4 h-4 text-[#FFDE00]" />
                  <span>Riwayat Pesanan</span>
                </Link>
              </>
            )}

            {def.primaryAction === 'retry' && (
              <>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-[#FFDE00]" />
                  <span>Coba Muat Ulang</span>
                </button>
                <Link
                  href="/"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#121212] text-xs sm:text-sm font-bold transition-all"
                >
                  <Home className="w-4 h-4" />
                  <span>Kembali ke Beranda</span>
                </Link>
              </>
            )}

            {def.primaryAction === 'home' && (
              <>
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
              </>
            )}
          </div>

          {/* Alternative Official Channels */}
          <div className="pt-5 border-t border-gray-100 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Jalur Bantuan & Order Resmi
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
