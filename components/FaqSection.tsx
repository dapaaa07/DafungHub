'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useBotStatus } from './BotStatusContext';

interface FaqItem {
  q: string;
  a: string;
}

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const { botStatus } = useBotStatus();
  const isOnline = botStatus === 'online';

  const faqs: FaqItem[] = [
    {
      q: 'Berapa lama proses pengiriman akun setelah saya order?',
      a: isOnline
        ? 'Pemesanan melalui Bot Telegram diproses otomatis dalam 1–5 menit setelah pembayaran QRIS terkonfirmasi. Untuk pemesanan via WhatsApp CS, tim admin kami akan memproses secepatnya pada jam operasional.'
        : 'Pemesanan melalui WhatsApp CS diproses secepatnya dalam hitungan menit pada jam operasional. Tim admin kami akan langsung memandu aktivasi dan mengirimkan kredensial secara aman.',
    },
    {
      q: 'Bagaimana alur pemesanan saat ini?',
      a: isOnline
        ? 'Anda dapat memesan secara otomatis 24 jam melalui Bot Telegram resmi (@dafung_hub_bot) dengan invoice QRIS instan, atau konsultasi langsung dengan admin via WhatsApp CS resmi.'
        : 'Saat ini pemesanan dialihkan langsung ke WhatsApp CS resmi Dafung Hub karena sistem Bot Telegram sedang dalam pemeliharaan (maintenance). Tim CS kami siap melayani konsultasi dan transaksi Anda 1-on-1.',
    },
    {
      q: 'Bagaimana jika akun mengalami kendala sebelum masa aktif habis?',
      a: 'Semua produk di Dafung Hub bergaransi full durasi. Jika terjadi kendala seperti logout mendadak, Anda cukup menginfokan ID pesanan ke Bot Telegram atau chat CS WhatsApp kami, dan akun pengganti akan segera diberikan.',
    },
    {
      q: 'Metode pembayaran apa saja yang didukung?',
      a: 'Kami mendukung pembayaran QRIS instan dari semua e-wallet (GoPay, OVO, DANA, ShopeePay) serta seluruh aplikasi Mobile Banking (BCA, Mandiri, BRI, BNI, Jago, dll). Bebas biaya admin tersembunyi.',
    },
    {
      q: 'Apakah akun privat atau sharing?',
      a: 'Setiap paket memiliki keterangan jelas di detail produk. Kami menyediakan opsi akun Private (eksklusif untuk Anda) maupun akun Sharing hemat dengan profil terpisah. Silakan cek detail pada masing-masing produk pilihan Anda.',
    },
  ];

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-16 sm:py-24 bg-white border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
            Pertanyaan Sering Diajukan
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#121212]">
            FAQ & Informasi Penting
          </h2>
          <p className="text-sm text-gray-600">
            Temukan jawaban cepat atas pertanyaan seputar pembelian produk digital di Dafung Hub.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-4">
          {faqs.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-2xl border border-gray-200 overflow-hidden transition-all bg-[#F8F9FA]"
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 font-extrabold text-sm sm:text-base text-[#121212] hover:bg-gray-100/60 transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-500 shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-yellow-600' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="p-5 sm:p-6 pt-0 text-xs sm:text-sm text-gray-600 leading-relaxed border-t border-gray-200/50 bg-white">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
