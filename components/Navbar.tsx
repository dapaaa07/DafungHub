'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Send, MessageCircle, Menu, X, ShieldCheck, Zap, User as UserIcon, Wallet, LogOut, PackageCheck, ChevronDown, Sparkles, Crown } from 'lucide-react';
import { CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME, formatRupiah } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';
import { useCustomerAuth } from './CustomerAuthContext';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { botStatus } = useBotStatus();
  const { customer, openAuthModal, openTopUpModal, logout } = useCustomerAuth();
  const isOnline = botStatus === 'online';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);

      // Dynamic active section detection
      const sections = ['katalog', 'keunggulan', 'cara-order', 'garansi', 'faq'];
      const scrollPos = window.scrollY + 120;
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 backdrop-blur-md shadow-xs border-b border-gray-200'
          : 'bg-white border-b border-gray-100'
      }`}
    >
      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className={`flex items-center justify-between transition-all duration-300 ${
            isScrolled ? 'h-16' : 'h-20'
          }`}
        >
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group py-2 shrink-0">
            <div className="relative h-11 w-44 sm:h-12 sm:w-52 group-hover:scale-[1.02] transition-transform">
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
          <nav className="hidden lg:flex items-center gap-7 xl:gap-8 text-sm font-semibold">
            <Link
              href="/#katalog"
              className={`transition-colors py-1.5 relative ${
                activeSection === 'katalog'
                  ? 'text-[#121212] font-extrabold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FFDE00]'
                  : 'text-gray-600 hover:text-[#121212]'
              }`}
            >
              Katalog Produk
            </Link>
            <Link
              href="/#keunggulan"
              className={`transition-colors py-1.5 relative ${
                activeSection === 'keunggulan'
                  ? 'text-[#121212] font-extrabold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FFDE00]'
                  : 'text-gray-600 hover:text-[#121212]'
              }`}
            >
              Keunggulan
            </Link>
            <Link
              href="/#cara-order"
              className={`transition-colors py-1.5 relative ${
                activeSection === 'cara-order'
                  ? 'text-[#121212] font-extrabold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FFDE00]'
                  : 'text-gray-600 hover:text-[#121212]'
              }`}
            >
              Cara Order
            </Link>
            <Link
              href="/#garansi"
              className={`transition-colors py-1.5 relative ${
                activeSection === 'garansi'
                  ? 'text-[#121212] font-extrabold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FFDE00]'
                  : 'text-gray-600 hover:text-[#121212]'
              }`}
            >
              Kebijakan Garansi
            </Link>
            <Link
              href="/#faq"
              className={`transition-colors py-1.5 relative ${
                activeSection === 'faq'
                  ? 'text-[#121212] font-extrabold after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#FFDE00]'
                  : 'text-gray-600 hover:text-[#121212]'
              }`}
            >
              FAQ
            </Link>
          </nav>

          {/* Desktop Direct Action Buttons & Auth */}
          <div className="hidden sm:flex items-center gap-3 lg:pl-6 lg:border-l lg:border-gray-200">
            {/* Telegram Bot Button */}
            {isOnline && (
              <a
                href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:text-black bg-gray-100 hover:bg-gray-200 transition-all"
                title="Bot Telegram Online 24 Jam"
              >
                <Send className="w-3.5 h-3.5 text-[#3AA8E8]" />
                <span>Telegram Bot</span>
              </a>
            )}

            {/* Customer Authentication & Profile */}
            {customer ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-xl border border-gray-200 bg-white hover:border-gray-300 shadow-sm transition-all focus:outline-none"
                >
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-[#121212] max-w-[120px] truncate">
                        {customer.username ? `@${customer.username}` : (customer.name || customer.email || 'Pelanggan')}
                      </span>
                      {customer.membership_tier === 'vip' && (
                        <span className="px-1.5 py-0.2 rounded-md bg-[#FFDE00] text-[#121212] text-[9px] font-black">
                          VIP
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600">
                      Saldo: {formatRupiah(customer.balance)}
                    </span>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-[#121212] text-white flex items-center justify-center font-bold text-xs">
                    {customer.avatar_url ? (
                      <img src={customer.avatar_url} alt="" className="w-full h-full rounded-lg object-cover" />
                    ) : (
                      (customer.name?.[0] || customer.username?.[0] || customer.email?.[0] || 'U').toUpperCase()
                    )}
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>

                {/* Dropdown Menu */}
                {userDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-4 py-2 border-b border-gray-100 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Akun Pelanggan
                        </span>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          ID: {customer.display_id || customer.telegram_id || `WEB-${customer.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`}
                        </span>
                      </div>
                      <p className="text-xs font-black text-gray-900 truncate">
                        {customer.username ? `@${customer.username}` : (customer.name || 'Pelanggan')}
                      </p>
                      {customer.email && (
                        <p className="text-[10px] text-gray-400 truncate">{customer.email}</p>
                      )}
                      <div className="pt-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Wallet className="w-3 h-3 text-emerald-600" />
                          <span className="text-xs font-extrabold text-emerald-600">
                            {formatRupiah(customer.balance)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUserDropdownOpen(false);
                            openTopUpModal();
                          }}
                          className="px-2 py-0.5 rounded-md bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] font-black text-[10px] shadow-2xs transition-all cursor-pointer"
                        >
                          + Top Up
                        </button>
                      </div>
                    </div>

                    <div className="py-1">
                      <Link
                        href="/orders"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-black transition-colors"
                      >
                        <PackageCheck className="w-4 h-4 text-[#3AA8E8]" />
                        <span>Riwayat Pesanan</span>
                      </Link>

                      <Link
                        href="/account#membership"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-black transition-colors"
                      >
                        <Crown className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                        <span>Kelola VIP Membership</span>
                        {customer.membership_tier === 'vip' && (
                          <span className="ml-auto text-[9px] bg-yellow-100 text-yellow-900 font-extrabold px-1.5 py-0.2 rounded">
                            AKTIF
                          </span>
                        )}
                      </Link>

                      <Link
                        href="/account"
                        onClick={() => setUserDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-black transition-colors"
                      >
                        <UserIcon className="w-4 h-4 text-purple-600" />
                        <span>Profil & Dompet Saldo</span>
                      </Link>
                    </div>

                    <div className="border-t border-gray-100 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-left"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Keluar (Logout)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#121212] hover:bg-[#252525] shadow-sm transition-all hover:scale-[1.02]"
              >
                <UserIcon className="w-3.5 h-3.5 text-[#FFDE00]" />
                <span>Masuk / Daftar</span>
              </button>
            )}

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
              <span>Chat CS WA</span>
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex sm:hidden items-center gap-2">
            {!customer && (
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#121212] text-white"
              >
                Masuk
              </button>
            )}
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
          {customer ? (
            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-[#121212]">
                      {customer.username ? `@${customer.username}` : (customer.name || customer.email || 'Pelanggan')}
                    </span>
                    {customer.membership_tier === 'vip' && (
                      <span className="px-2 py-0.5 rounded-md bg-[#FFDE00] text-[#121212] text-[10px] font-black inline-flex items-center gap-1">
                        VIP
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">
                    ID: {customer.display_id || customer.telegram_id || `WEB-${customer.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`}
                  </span>
                </div>
              </div>
              <div className="text-xs font-bold text-emerald-600 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Saldo: {formatRupiah(customer.balance)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openTopUpModal();
                  }}
                  className="px-2.5 py-0.5 rounded-md bg-[#FFDE00] text-[#121212] font-black text-[10px] cursor-pointer"
                >
                  + Top Up
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-gray-200/60">
                <Link
                  href="/orders"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-center rounded-xl bg-white border border-gray-200 text-[11px] font-bold text-gray-700"
                >
                  Pesanan
                </Link>
                <Link
                  href="/account#membership"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-center rounded-xl bg-white border border-amber-200 text-[11px] font-bold text-amber-700"
                >
                  VIP Member
                </Link>
                <Link
                  href="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className="py-2 text-center rounded-xl bg-white border border-gray-200 text-[11px] font-bold text-gray-700"
                >
                  Profil/Saldo
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 rounded-2xl border border-yellow-200 flex items-center justify-between">
              <div>
                <span className="font-extrabold text-xs text-[#121212] block">Belum punya akun?</span>
                <span className="text-[11px] text-gray-600">Daftar & nikmati diskon khusus</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openAuthModal('login');
                }}
                className="px-3.5 py-1.5 rounded-xl bg-[#121212] text-white text-xs font-bold"
              >
                Masuk / Daftar
              </button>
            </div>
          )}

          <nav className="flex flex-col space-y-2 text-base font-semibold text-gray-800">
            <Link
              href="/#katalog"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Katalog Produk
            </Link>
            <Link
              href="/#keunggulan"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Keunggulan
            </Link>
            <Link
              href="/#cara-order"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Cara Order
            </Link>
            <Link
              href="/#garansi"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              Kebijakan Garansi
            </Link>
            <Link
              href="/#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-lg hover:bg-gray-100"
            >
              FAQ
            </Link>
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

            {customer && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="w-full py-2.5 rounded-xl text-center text-xs font-bold text-red-600 bg-red-50 border border-red-100"
              >
                Keluar dari Akun
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
