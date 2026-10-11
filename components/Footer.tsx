'use client';

import Image from 'next/image';
import { Send, MessageCircle, ShieldCheck } from 'lucide-react';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';

export default function Footer() {
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  return (
    <footer className="bg-[#121212] text-white pt-16 pb-12 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
          {/* Brand Info (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="inline-block p-2 rounded-2xl bg-[#FFDE00] shadow-md">
              <Image
                src="/logo-cropped.png"
                alt="Dafung Hub — Layanan Digital Premium"
                width={200}
                height={80}
                className="h-11 w-auto object-contain"
              />
            </div>
            <p className="text-xs sm:text-sm text-gray-400 max-w-sm leading-relaxed">
              Platform penyedia langganan produk digital terpercaya di Indonesia. Kami menghadirkan akun premium resmi dengan proses otomatis instan dan jaminan garansi full durasi.
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4 text-[#3AA8E8]" />
              <span>Garansi Full Masa Langganan Aktif</span>
            </div>
          </div>

          {/* Nav Links (3 cols) */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-gray-300">
              Menu Navigasi
            </h4>
            <ul className="space-y-2 text-xs text-gray-400 font-medium">
              <li>
                <a href="#katalog" className="hover:text-[#FFDE00] transition-colors">
                  Katalog Semua Produk
                </a>
              </li>
              <li>
                <a href="#keunggulan" className="hover:text-[#FFDE00] transition-colors">
                  4 Keunggulan Utama
                </a>
              </li>
              <li>
                <a href="#cara-order" className="hover:text-[#FFDE00] transition-colors">
                  Panduan Cara Order
                </a>
              </li>
              <li>
                <a href="#garansi" className="hover:text-[#FFDE00] transition-colors">
                  Kebijakan Garansi Penuh
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-[#FFDE00] transition-colors">
                  Tanya Jawab (FAQ)
                </a>
              </li>
            </ul>
          </div>

          {/* Official Contacts & Hours (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-gray-300">
              Layanan Pelanggan Resmi
            </h4>
            <div className="space-y-3">
              <a
                href={`https://wa.me/${CS_WHATSAPP_INTL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-[#FFDE00] transition-colors">
                    WhatsApp Customer Support
                  </div>
                  <div className="text-[11px] text-gray-400">0812-9495-0241 (08.00 - 23.00 WIB)</div>
                </div>
              </a>

              {isOnline ? (
                <a
                  href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#3AA8E8]/20 text-[#3AA8E8] flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-[#FFDE00] transition-colors">
                      Telegram Bot (Online 24 Jam)
                    </div>
                    <div className="text-[11px] text-gray-400">@{TELEGRAM_BOT_USERNAME}</div>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 opacity-75">
                  <div className="w-8 h-8 rounded-lg bg-gray-500/20 text-gray-400 flex items-center justify-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-300">
                      Telegram Bot (Sedang Maintenance)
                    </div>
                    <div className="text-[11px] text-gray-400">@{TELEGRAM_BOT_USERNAME}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
          <p>© 2026 Dafung Hub. All rights reserved.</p>
          <div className="flex items-center gap-1 text-[11px]">
            <span>Didesain dengan standar teknologi terbaik untuk pengalaman belanja digital yang nyaman</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
