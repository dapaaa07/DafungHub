'use client';

import { Search, Send, CheckCircle2 } from 'lucide-react';
import { useBotStatus } from './BotStatusContext';

export default function HowItWorks() {
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  const steps = [
    {
      step: '01',
      title: 'Pilih Paket Digital',
      desc: 'Cari produk yang kamu inginkan di katalog Dafung Hub, pilih varian durasi (1 Bulan, 1 Tahun, dll).',
      icon: Search,
      badge: 'Langkah 1',
    },
    {
      step: '02',
      title: isOnline ? 'Pesan Cepat Otomatis via Bot' : 'Pesan via WhatsApp CS',
      desc: isOnline
        ? 'Pilih pesanan langsung via Bot Telegram otomatis 24 jam dengan QRIS instan, atau hubungi CS WhatsApp kami.'
        : 'Klik Beli Sekarang untuk konfirmasi pesanan langsung via WhatsApp CS kami (Bot Telegram sedang maintenance).',
      icon: Send,
      badge: 'Langkah 2',
    },
    {
      step: '03',
      title: 'Akun Aktif & Garansi',
      desc: 'Dapatkan kredensial login atau link aktivasi instan dalam 5 menit, lengkap dengan garansi resmi full durasi.',
      icon: CheckCircle2,
      badge: 'Langkah 3',
    },
  ];

  return (
    <section id="cara-order" className="py-16 sm:py-24 bg-white border-t border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Heading */}
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-yellow-600 bg-yellow-400/15 px-3 py-1 rounded-full border border-yellow-300">
            Alur Pemesanan Mudah
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#121212]">
            Cara Pemesanan 3 Langkah Cepat
          </h2>
          <p className="text-sm text-gray-600">
            Tanpa registrasi yang rumit, nikmati layanan digital favoritmu hanya dalam hitungan menit.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((st, i) => {
            const Icon = st.icon;
            return (
              <div
                key={i}
                className="relative bg-[#F8F9FA] rounded-3xl p-8 border border-gray-200 hover:border-yellow-400 hover:shadow-lg transition-all group"
              >
                {/* Step Number Watermark */}
                <span className="absolute top-6 right-6 text-4xl font-black text-gray-200 group-hover:text-yellow-400/30 transition-colors pointer-events-none">
                  {st.step}
                </span>

                <div className="w-14 h-14 rounded-2xl bg-[#FFDE00] flex items-center justify-center text-[#121212] mb-6 shadow-sm group-hover:scale-105 transition-transform">
                  <Icon className="w-7 h-7" />
                </div>

                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#3AA8E8] block mb-1">
                  {st.badge}
                </span>

                <h3 className="text-lg font-extrabold text-[#121212] mb-2">
                  {st.title}
                </h3>

                <p className="text-xs text-gray-600 leading-relaxed">
                  {st.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
