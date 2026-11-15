'use client';

import React from 'react';
import Link from 'next/link';
import {
  User as UserIcon,
  Wallet,
  Crown,
  Sparkles,
  ShieldCheck,
  Send,
  MessageCircle,
  PackageCheck,
  LogOut,
  ArrowRight,
  Loader2,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { formatRupiah, CS_WHATSAPP_INTL, TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useCustomerAuth } from '@/components/CustomerAuthContext';

export default function AccountPage() {
  const { customer, isLoading, openAuthModal, logout } = useCustomerAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#FFDE00]" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
        <Navbar />
        <main className="flex-1 max-w-lg w-full mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-yellow-100 text-[#121212] flex items-center justify-center mx-auto">
            <UserIcon className="w-7 h-7 text-yellow-800" />
          </div>
          <h1 className="text-xl font-black text-gray-900">Masuk ke Akun Anda</h1>
          <p className="text-xs text-gray-500">
            Akses saldo akun, status VIP membership, dan riwayat pesanan Anda di Dafung Hub.
          </p>
          <button
            onClick={() => openAuthModal('login')}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white font-black text-xs shadow-md transition-all"
          >
            <span>Masuk / Daftar Akun</span>
            <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
          </button>
        </main>
        <Footer />
      </div>
    );
  }

  const isVip = customer.membership_tier === 'vip';

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:py-12 space-y-6">
        {/* Profile Header Card */}
        <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-[#121212] text-white flex items-center justify-center text-2xl font-black shadow-md shrink-0">
              {customer.avatar_url ? (
                <img
                  src={customer.avatar_url}
                  alt={customer.name || ''}
                  className="w-full h-full rounded-2xl object-cover"
                />
              ) : (
                (customer.name?.[0] || customer.email?.[0] || 'U').toUpperCase()
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black text-[#121212]">
                  {customer.name || 'Pelanggan Dafung Hub'}
                </h1>
                {isVip ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FFDE00] text-[#121212] text-[10px] font-black inline-flex items-center gap-1 shadow-sm">
                    <Crown className="w-3 h-3 fill-current" /> MEMBER VIP
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold">
                    Reguler
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-500">
                {customer.email || customer.phone || 'Akun Web'}
              </p>

              {customer.telegram_id && (
                <p className="text-[11px] text-gray-400">
                  Telegram ID: <code>{customer.telegram_id}</code>
                </p>
              )}
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <Link
              href="/orders"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs shadow-sm transition-all"
            >
              <PackageCheck className="w-4 h-4 text-[#3AA8E8]" />
              <span>Riwayat Pesanan</span>
            </Link>

            <button
              onClick={() => logout()}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 font-bold text-xs transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>

        {/* Dual Cards: Saldo & Membership */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Saldo Akun */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-600" /> Saldo Dompet Akun
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-extrabold">
                  Aktif
                </span>
              </div>

              <div>
                <span className="text-3xl sm:text-4xl font-black text-[#121212] block">
                  {formatRupiah(customer.balance)}
                </span>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Hemat <b>Rp 200</b> untuk setiap pembelian akun jika dibayar menggunakan Saldo!
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-2">
              <span className="text-[11px] font-bold text-gray-700 block">
                Ingin Top-Up Saldo?
              </span>
              <div className="flex gap-2">
                <a
                  href={`https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
                    `Halo CS Dafung Hub, saya ingin top-up saldo akun website: ${customer.email || customer.phone || customer.name}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] font-black text-xs shadow-sm transition-all"
                >
                  <MessageCircle className="w-4 h-4 text-[#121212]" />
                  <span>Top-Up via WhatsApp</span>
                </a>

                <a
                  href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center p-2.5 rounded-xl bg-[#121212] hover:bg-[#252525] text-white shadow-sm transition-all"
                  title="Top-Up di Telegram Bot"
                >
                  <Send className="w-4 h-4 text-[#3AA8E8]" />
                </a>
              </div>
            </div>
          </div>

          {/* Card 2: VIP Membership Status */}
          <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-500" /> Keanggotaan VIP
                </span>
                {isVip && (
                  <span className="px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-900 text-[10px] font-black">
                    VIP AKTIF
                  </span>
                )}
              </div>

              {isVip ? (
                <div className="space-y-2">
                  <div className="text-2xl font-black text-[#121212]">
                    Status VIP Premium ⭐
                  </div>
                  {customer.membership_expires_at && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <span>
                        Aktif hingga:{' '}
                        <b>
                          {new Date(customer.membership_expires_at).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </b>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xl font-black text-[#121212]">
                    Belum Jadi Member VIP
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Upgrade ke VIP untuk mendapatkan diskon langsung Rp 1.000 pada setiap akun!
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-4 border-t border-gray-100 text-[11px] text-gray-600">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Diskon Rp 1.000 per produk akun digital</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Antrean prioritas & layanan garansi cepat</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Akses lebih awal ke promo dan restock langka</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
