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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Headlines & CTAs */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-gray-200">
              <div className="relative w-4 h-4 rounded-full overflow-hidden shrink-0 bg-[#FFDE00]">
                <Image src="/logo-d.png" alt="Dafung Hub Icon" fill className="object-cover" />
              </div>
              <span className="text-[#FFDE00] font-bold">Dafung Hub</span>
              <span className="text-gray-400">|</span>
              <span>Platform Langganan Digital #1</span>
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
            <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              Dapatkan akses akun premium resmi untuk produktivitas, streaming, desain, dan AI dengan harga distributor termurah. Didukung sistem bot otomatis 24 jam dan garansi full masa aktif!
            </p>

            {/* Action CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
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
            <div className="pt-6 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#FFDE00]/15 flex items-center justify-center text-[#FFDE00]">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Proses Instan</div>
                  <div className="text-[11px] text-gray-400">Auto 5 Menit</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#3AA8E8]/15 flex items-center justify-center text-[#3AA8E8]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">Garansi Penuh</div>
                  <div className="text-[11px] text-gray-400">Full Masa Aktif</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">100% Legal</div>
                  <div className="text-[11px] text-gray-400">Kredensial Aman</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-white">CS 24/7</div>
                  <div className="text-[11px] text-gray-400">Siap Melayani</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Visual Showcase Card */}
          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-md lg:max-w-none rounded-3xl bg-gradient-to-br from-white/10 to-white/5 p-6 border border-white/15 backdrop-blur-xl shadow-2xl">
              {/* Card Banner Header */}
              <div className="relative h-48 w-full rounded-2xl overflow-hidden mb-5 border border-white/10 bg-[#0a0a0a]">
                <Image
                  src="/banner.png"
                  alt="Dafung Hub Premium Banner"
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
                  <span className="px-2.5 py-1 rounded-md bg-[#FFDE00] text-[#121212] font-black tracking-wide uppercase">
                    Official Catalog
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-black/60 text-white font-medium border border-white/20">
                    50+ Produk Ready
                  </span>
                </div>
              </div>

              {/* Floating Mini Feature Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 p-1.5 flex items-center justify-center shrink-0">
                      <Image
                        src="/logos/netflix.png"
                        alt="Netflix"
                        width={28}
                        height={28}
                        className="object-contain"
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">Netflix Premium UHD</div>
                      <div className="text-xs text-gray-400">Anti Hold • Profil Privat • 4K HDR</div>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-[#FFDE00] bg-yellow-400/10 px-2 py-1 rounded">
                    Terlaris
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 p-1.5 flex items-center justify-center shrink-0">
                      <Image
                        src="/logos/capcut.png"
                        alt="CapCut"
                        width={28}
                        height={28}
                        className="object-contain"
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">CapCut Pro & Canva</div>
                      <div className="text-xs text-gray-400">Full Garansi 30 Hari • Fitur VIP</div>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-[#3AA8E8] bg-cyan-400/10 px-2 py-1 rounded">
                    Favorit
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 p-1.5 flex items-center justify-center shrink-0">
                      <Image
                        src="/logos/claude.png"
                        alt="Claude AI"
                        width={28}
                        height={28}
                        className="object-contain"
                      />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white">Claude AI & Gemini Advanced</div>
                      <div className="text-xs text-gray-400">Akses Model Terkuat • Tanpa Antri</div>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-purple-300 bg-purple-500/10 px-2 py-1 rounded">
                    Gen AI
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
