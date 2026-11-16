'use client';

import Image from 'next/image';
import { Send, ArrowDown, ShieldCheck, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';

export default function HeroSection() {
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#121212] via-[#161616] to-[#121212] text-white pt-12 pb-20 lg:pt-20 lg:pb-28 border-b border-gray-800/80">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center space-y-7">
        {/* Pill Tag */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-gray-200">
          <div className="relative w-4 h-4 rounded-full overflow-hidden shrink-0 bg-[#FFDE00]">
            <Image src="/logo-d.png" alt="Dafung Hub Icon" fill className="object-cover" />
          </div>
          <span className="text-[#FFDE00] font-bold">Dafung Hub</span>
          <span className="text-gray-400">|</span>
          <span>Katalog Akun &amp; Layanan Digital</span>
        </div>

        {/* Main Title */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.2]">
          Layanan Digital{' '}
          <span className="text-[#FFDE00]">
            Cepat
          </span>
          , Hemat, &amp;{' '}
          <span className="text-[#3AA8E8]">
            Bergaransi
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
          Dapatkan akses akun premium untuk produktivitas, streaming, desain, dan AI dengan harga terjangkau. Pemesanan praktis via Website maupun Bot Telegram otomatis 24 jam dengan jaminan garansi penuh selama masa aktif.
        </p>

        {/* Action CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          {/* Primary Action Button */}
          <a
            href="#katalog"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-xl font-extrabold text-base text-[#121212] bg-[#FFDE00] hover:bg-[#FFE838] shadow-lg shadow-yellow-400/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            <span>Eksplor Katalog Produk</span>
            <ArrowDown className="w-4 h-4" />
          </a>

          {/* Secondary Action Button (Dynamic Online vs Maintenance) */}
          {isOnline ? (
            <a
              href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl font-bold text-sm text-white bg-white/10 hover:bg-white/20 border border-white/20 shadow-md hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Send className="w-4 h-4 text-[#3AA8E8]" />
              <span>Mulai di Telegram Bot</span>
            </a>
          ) : (
            <button
              disabled
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl font-bold text-sm text-gray-400 bg-white/5 border border-white/10 cursor-not-allowed opacity-75"
              title="Bot Telegram sedang maintenance"
            >
              <Send className="w-4 h-4 text-gray-500" />
              <span>Telegram Bot (Sedang Maintenance)</span>
            </button>
          )}
        </div>

        {/* Trust Badges Bar */}
        <div className="pt-8 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-xs text-gray-300 max-w-3xl mx-auto text-left">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="w-8 h-8 rounded-lg bg-[#FFDE00]/15 flex items-center justify-center text-[#FFDE00] shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white">Proses Instan</div>
              <div className="text-[11px] text-gray-400">Auto 5 Menit</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="w-8 h-8 rounded-lg bg-[#3AA8E8]/15 flex items-center justify-center text-[#3AA8E8] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white">Garansi Penuh</div>
              <div className="text-[11px] text-gray-400">Full Masa Aktif</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white">Akun Terverifikasi</div>
              <div className="text-[11px] text-gray-400">Kredensial Aman</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-white">Web &amp; Bot Aktif</div>
              <div className="text-[11px] text-gray-400">Order Fleksibel</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
