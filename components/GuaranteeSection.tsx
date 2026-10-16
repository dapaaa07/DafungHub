'use client';

import { ShieldCheck, RefreshCw, Lock, MessageCircle } from 'lucide-react';
import { CS_WHATSAPP_INTL } from '@/lib/pricing';

export default function GuaranteeSection() {
  const points = [
    {
      icon: ShieldCheck,
      title: 'Garansi Full Durasi',
      desc: 'Setiap akun dilindungi garansi selama masa aktif yang Anda beli. Jika masa langganan 30 hari, kami garansi penuh hingga hari ke-30.',
    },
    {
      icon: RefreshCw,
      title: 'Penggantian Akun Cepat',
      desc: 'Jika akun tiba-tiba logout atau bermasalah, cukup hubungi CS atau kirim laporan ke bot. Penggantian diproses setelah bukti kendala dikonfirmasi.',
    },
    {
      icon: Lock,
      title: 'Privasi & Keamanan Terjaga',
      desc: 'Data transaksi dan kredensial akun terenkripsi aman. Profil privat bebas gangguan dari pihak lain.',
    },
  ];

  return (
    <section id="garansi" className="py-16 sm:py-24 bg-[#121212] text-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[#3AA8E8] bg-[#3AA8E8]/15 px-3 py-1 rounded-full border border-[#3AA8E8]/30">
            Jaminan Layanan
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Kebijakan Garansi &amp; Transparansi
          </h2>
          <p className="text-sm text-gray-400">
            Kami menjamin transparansi status akun, durasi langganan, dan prosedur klaim yang jelas tanpa biaya tambahan.
          </p>
        </div>

        {/* 3 Columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {points.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={i}
                className="bg-[#181818] rounded-2xl p-6 sm:p-8 border border-[#262626] hover:border-[#383838] transition-all space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#FFDE00] flex items-center justify-center text-[#121212]">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">
                  {p.title}
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Support Banner Callout */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#181818] border border-[#2a2a2a] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-base sm:text-lg font-extrabold text-white">
              Punya Pertanyaan Seputar Garansi?
            </h4>
            <p className="text-xs text-gray-400">
              Tim Customer Support kami siap memberikan penjelasan detail sebelum Anda bertransaksi.
            </p>
          </div>
          <a
            href={`https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
              'Halo Admin Dafung Hub, saya ingin bertanya tentang klaim garansi produk digital.'
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3.5 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] font-extrabold text-xs flex items-center gap-2 shrink-0 transition-transform hover:scale-105"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Tanya Admin via WhatsApp</span>
          </a>
        </div>
      </div>
    </section>
  );
}
