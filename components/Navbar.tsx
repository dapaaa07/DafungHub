'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Send, MessageCircle, Menu, X, ShieldCheck, Zap } from 'lucide-react';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  return (
    <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-gray-200">
      {/* Top Announcement Bar */}
      <div className="bg-[#121212] text-white text-xs py-1.5 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
            <span className="inline-flex items-center gap-1 font-semibold text-[#FFDE00]">
              <Zap className="w-3.5 h-3.5 fill-[#FFDE00]" /> Info Layanan:
            </span>
            <span className="text-gray-300">
              {isOnline
                ? '🟢 Bot Telegram Online 24 Jam — Siap Melayani Transaksi Otomatis!'
                : '⚠️ Bot Telegram sedang maintenance. Pemesanan dialihkan via WhatsApp CS!'}
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-gray-300 text-xs">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3AA8E8]" /> Garansi Full Durasi
            </span>
            <a
              href={`https://wa.me/${CS_WHATSAPP_INTL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#FFDE00] transition-colors"
            >
              CS WA: 0812-9495-0241
            </a>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group py-2">
            <div className="relative h-12 w-48 sm:w-56 group-hover:scale-[1.02] transition-transform">
              <Image
                src="/logo-transparent.png"
                alt="Dafung Hub — Layanan Digital Premium"
                fill
                priority
                className="object-contain object-left"
              />
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-8 text-sm font-semibold text-gray-700">
            <a href="#katalog" className="hover:text-[#121212] transition-colors">
              Katalog Produk
            </a>
            <a href="#keunggulan" className="hover:text-[#121212] transition-colors">
              Keunggulan
            </a>
            <a href="#cara-order" className="hover:text-[#121212] transition-colors">
              Cara Order
            </a>
            <a href="#garansi" className="hover:text-[#121212] transition-colors">
              Kebijakan Garansi
            </a>
            <a href="#faq" className="hover:text-[#121212] transition-colors">
              FAQ
            </a>
          </nav>

          {/* Desktop Direct Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            {/* WhatsApp CS Button */}
            <a
              href={`https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
                'Halo CS Dafung Hub, saya ingin konsultasi produk digital premium.'
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#121212] bg-[#FFDE00] hover:bg-[#FFE838] shadow-sm transition-all hover:scale-[1.02]"
            >
              <MessageCircle className="w-4 h-4 text-[#121212]" />
              <span>Chat CS WA (Aktif)</span>
            </a>

            {/* Telegram Bot Button (Dynamic Online vs Maintenance) */}
            {isOnline ? (
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#121212] hover:bg-[#252525] border border-gray-800 shadow-sm transition-all hover:scale-[1.02]"
                title="Bot Telegram Online 24 Jam"
              >
                <Send className="w-3.5 h-3.5 text-[#3AA8E8]" />
                <span>Bot Telegram (Online)</span>
              </a>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed opacity-80"
                title="Bot Telegram sedang maintenance"
              >
                <Send className="w-3.5 h-3.5 text-gray-400" />
                <span>Bot Telegram (Maintenance)</span>
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="flex sm:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2.5 rounded-xl text-gray-700 hover:text-black hover:bg-gray-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-200 bg-white px-4 pt-3 pb-6 space-y-3">
          <nav className="flex flex-col space-y-2 text-base font-semibold text-gray-800">
            <a
              href="#katalog"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Katalog Produk
            </a>
            <a
              href="#keunggulan"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Keunggulan
            </a>
            <a
              href="#cara-order"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Cara Order
            </a>
            <a
              href="#garansi"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Kebijakan Garansi
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              FAQ
            </a>
          </nav>

          <div className="pt-2 border-t border-gray-100 flex flex-col gap-2">
            <a
              href={`https://wa.me/${CS_WHATSAPP_INTL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#FFDE00] text-[#121212] font-bold text-sm shadow-sm"
            >
              <MessageCircle className="w-4 h-4 text-[#121212]" />
              <span>Pesan via WhatsApp CS (Aktif)</span>
            </a>

            {isOnline ? (
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#121212] text-white font-bold text-xs shadow-sm hover:bg-[#252525]"
              >
                <Send className="w-4 h-4 text-[#3AA8E8]" />
                <span>Buka Bot Telegram (Online 24 Jam)</span>
              </a>
            ) : (
              <button
                disabled
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gray-100 text-gray-400 font-bold text-xs cursor-not-allowed border border-gray-200"
              >
                <Send className="w-4 h-4 text-gray-400" />
                <span>Telegram Bot (Sedang Maintenance)</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
