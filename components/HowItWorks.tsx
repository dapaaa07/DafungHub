'use client';

import { useState } from 'react';
import { Globe, Send, CreditCard, CheckCircle2, ShieldCheck, ShoppingBag, ArrowRight } from 'lucide-react';
import { TELEGRAM_BOT_USERNAME } from '@/lib/pricing';
import { useBotStatus } from './BotStatusContext';

export default function HowItWorks() {
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';
  const [activeChannel, setActiveChannel] = useState<'web' | 'bot'>('web');

  const webSteps = [
    {
      step: '01',
      title: 'Pilih Produk & Durasi',
      desc: 'Buka katalog produk di halaman ini, pilih paket langganan serta varian durasi (1 Bulan, 1 Tahun, dll) sesuai kebutuhan Anda.',
      icon: ShoppingBag,
    },
    {
      step: '02',
      title: 'Bayar via QRIS atau Saldo',
      desc: 'Klik Beli Sekarang, masukkan email Anda atau masuk ke akun pelanggan, lalu selesaikan pembayaran instan via QRIS otomatis atau potong saldo akun.',
      icon: CreditCard,
    },
    {
      step: '03',
      title: 'Akun Langsung Tampil & Aktif',
      desc: 'Setelah pembayaran terverifikasi otomatis, data kredensial login langsung muncul di layar dan tersimpan rapi di halaman Riwayat Pesanan.',
      icon: CheckCircle2,
    },
  ];

  const botSteps = [
    {
      step: '01',
      title: 'Buka Bot Telegram',
      desc: `Buka aplikasi Telegram dan cari @${TELEGRAM_BOT_USERNAME}, lalu ketik /start untuk membuka menu katalog interaktif.`,
      icon: Send,
    },
    {
      step: '02',
      title: 'Pilih Produk & Scan QRIS',
      desc: 'Pilih kategori dan paket melalui tombol menu bot. Sistem bot akan otomatis membuat invoice QRIS instan.',
      icon: CreditCard,
    },
    {
      step: '03',
      title: 'Akun Dikirim ke Chat Anda',
      desc: 'Dalam 1-5 menit setelah transfer terdeteksi, bot akan langsung mengirimkan email, password, dan panduan lengkap ke ruang chat privat Anda.',
      icon: CheckCircle2,
    },
  ];

  const currentSteps = activeChannel === 'web' ? webSteps : botSteps;

  return (
    <section id="cara-order" className="py-16 sm:py-24 bg-white border-t border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Heading */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-700 bg-yellow-400/20 px-3 py-1 rounded-full border border-yellow-300">
            Panduan Pembelian
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#121212]">
            Cara Pemesanan Cepat &amp; Praktis
          </h2>
          <p className="text-sm text-gray-600">
            Dafung Hub mendukung pemesanan langsung via Website maupun Bot Telegram otomatis 24 jam nonstop. Pilih cara yang paling nyaman untuk Anda.
          </p>

          {/* Channel Selector Toggle */}
          <div className="inline-flex p-1.5 rounded-2xl bg-gray-100 border border-gray-200 gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => setActiveChannel('web')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeChannel === 'web'
                  ? 'bg-white text-[#121212] shadow-sm'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <Globe className="w-4 h-4 text-[#3AA8E8]" />
              <span>Pesan via Website (Praktis)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveChannel('bot')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                activeChannel === 'bot'
                  ? 'bg-white text-[#121212] shadow-sm'
                  : 'text-gray-600 hover:text-black'
              }`}
            >
              <Send className="w-4 h-4 text-[#3AA8E8]" />
              <span>Pesan via Bot Telegram</span>
            </button>
          </div>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {currentSteps.map((st, i) => {
            const Icon = st.icon;
            return (
              <div
                key={i}
                className="relative bg-[#F8F9FA] rounded-3xl p-8 border border-gray-200 hover:border-yellow-400 hover:shadow-lg transition-all group flex flex-col justify-between"
              >
                <div>
                  {/* Step Number Watermark */}
                  <span className="absolute top-6 right-6 text-4xl font-black text-gray-200 group-hover:text-yellow-400/30 transition-colors pointer-events-none">
                    {st.step}
                  </span>

                  <div className="w-14 h-14 rounded-2xl bg-[#FFDE00] flex items-center justify-center text-[#121212] mb-6 shadow-sm group-hover:scale-105 transition-transform">
                    <Icon className="w-7 h-7" />
                  </div>

                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#3AA8E8] block mb-1">
                    Langkah {i + 1}
                  </span>

                  <h3 className="text-lg font-extrabold text-[#121212] mb-2">
                    {st.title}
                  </h3>

                  <p className="text-xs text-gray-600 leading-relaxed">
                    {st.desc}
                  </p>
                </div>

                <div className="pt-6 mt-6 border-t border-gray-200/60 flex items-center gap-2 text-[11px] font-semibold text-gray-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Garansi Full Masa Aktif</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Callout Bar */}
        <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <h4 className="font-extrabold text-sm text-[#121212]">
              {activeChannel === 'web'
                ? 'Siap belanja langsung di website?'
                : 'Ingin bertransaksi cepat di aplikasi Telegram?'}
            </h4>
            <p className="text-xs text-gray-600">
              {activeChannel === 'web'
                ? 'Pilih produk dari katalog kami di bawah dan checkout dalam 1 menit.'
                : 'Bot resmi kami beroperasi otomatis 24 jam dengan respon instan.'}
            </p>
          </div>

          {activeChannel === 'web' ? (
            <a
              href="#katalog"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-black text-white font-bold text-xs transition-all hover:scale-102 shrink-0"
            >
              <span>Lihat Katalog Produk</span>
              <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
            </a>
          ) : isOnline ? (
            <a
              href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#3AA8E8] hover:bg-[#2f96d2] text-white font-bold text-xs transition-all hover:scale-102 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Buka @{TELEGRAM_BOT_USERNAME}</span>
            </a>
          ) : (
            <span className="text-xs text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg font-bold">
              Bot Telegram sedang pemeliharaan
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
