'use client';

import { Zap, ShieldCheck, Layers, Headphones } from 'lucide-react';

export default function ValueProps() {
  const values = [
    {
      icon: Zap,
      color: 'bg-yellow-500/10 text-yellow-600',
      title: 'Proses Instan & Otomatis',
      description: 'Pengiriman akun diproses secepat kilat setelah order. Bot aktif 24 jam nonstop melayani Anda.',
    },
    {
      icon: ShieldCheck,
      color: 'bg-cyan-500/10 text-cyan-600',
      title: 'Garansi Full Durasi',
      description: 'Garansi penggantian akun baru tanpa dipersulit jika terjadi kendala selama masa langganan aktif.',
    },
    {
      icon: Layers,
      color: 'bg-indigo-500/10 text-indigo-600',
      title: 'Katalog Super Lengkap',
      description: 'Pilihan puluhan akun resmi: streaming film, AI produktivitas, editing, office, hingga tool bisnis.',
    },
    {
      icon: Headphones,
      color: 'bg-emerald-500/10 text-emerald-600',
      title: 'Dukungan CS 24/7',
      description: 'Tim support responsif siap membantu konsultasi dan kendala via WhatsApp dan Telegram kapan pun.',
    },
  ];

  return (
    <section id="keunggulan" className="py-12 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((v, i) => {
            const Icon = v.icon;
            return (
              <div
                key={i}
                className="p-6 rounded-2xl bg-[#F8F9FA] border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all group"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${v.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-extrabold text-[#121212] mb-1.5">
                  {v.title}
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  {v.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
