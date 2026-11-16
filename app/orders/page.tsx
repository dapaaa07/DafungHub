'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PackageCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Loader2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { formatRupiah } from '@/lib/pricing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useCustomerAuth } from '@/components/CustomerAuthContext';

interface CustomerOrder {
  id: string;
  orderCode: string;
  productName: string;
  paymentStatus: 'unpaid' | 'paid' | 'expired';
  fulfillmentStatus: 'pending' | 'processing' | 'delivered';
  paymentMethod: string;
  payableAmount: number;
  createdAt: string;
  deliveredAt: string | null;
  credentials: string | null;
}

export default function CustomerOrdersPage() {
  const { customer, isLoading: isAuthLoading, openAuthModal } = useCustomerAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (!customer) {
      setIsLoading(false);
      return;
    }

    const fetchOrders = async () => {
      try {
        const res = await fetch('/api/user/orders', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setOrders(data.orders || []);
        }
      } catch (err) {
        console.error('Error fetching customer orders:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [customer]);

  const handleCopyCredentials = (creds: string) => {
    navigator.clipboard.writeText(creds);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:py-12">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#121212] flex items-center gap-2">
              <PackageCheck className="w-6 h-6 text-[#3AA8E8]" />
              <span>Riwayat Pesanan Anda</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Daftar seluruh pembelian akun digital dan status pengirimannya di Dafung Hub.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs font-bold transition-all shrink-0"
          >
            <span>Katalog Produk</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#FFDE00]" />
          </Link>
        </div>

        {isAuthLoading || isLoading ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-[#FFDE00] mx-auto" />
            <p className="text-xs font-bold text-gray-500">Memuat riwayat transaksi...</p>
          </div>
        ) : !customer ? (
          <div className="p-10 text-center bg-white rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-yellow-100 text-[#121212] flex items-center justify-center mx-auto">
              <UserIcon className="w-6 h-6 text-yellow-800" />
            </div>
            <h2 className="text-lg font-black text-gray-800">Masuk untuk Melihat Riwayat Pesanan</h2>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Silakan login dengan Email, Nomor WhatsApp, atau Akun Google untuk mengakses seluruh riwayat akun yang pernah Anda beli.
            </p>
            <button
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#121212] hover:bg-[#252525] text-white text-xs font-black shadow-md transition-all"
            >
              <span>Masuk / Daftar Akun</span>
              <ArrowRight className="w-4 h-4 text-[#FFDE00]" />
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center bg-white rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <PackageCheck className="w-12 h-12 text-gray-300 mx-auto" />
            <h2 className="text-base font-black text-gray-800">Belum Ada Pesanan</h2>
            <p className="text-xs text-gray-500">
              Anda belum melakukan pemesanan produk digital di Dafung Hub.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#FFDE00] text-[#121212] font-black text-xs shadow-sm transition-all"
            >
              <span>Mulai Belanja Akun Digital</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((ord) => {
              const isDelivered = ord.fulfillmentStatus === 'delivered';
              const isPaid = ord.paymentStatus === 'paid';
              const isExpired = ord.paymentStatus === 'expired';

              return (
                <div
                  key={ord.id}
                  className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 shadow-sm hover:border-gray-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-gray-500">
                        {ord.orderCode}
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="text-[11px] text-gray-400">
                        {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {/* Status Badges */}
                      {isDelivered ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Selesai
                        </span>
                      ) : isPaid ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-600" /> Memproses Akun
                        </span>
                      ) : isExpired ? (
                        <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 text-[10px] font-black">
                          Expired
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black">
                          Menunggu Bayar
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm sm:text-base font-extrabold text-[#121212] truncate">
                      {ord.productName}
                    </h3>

                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="font-bold text-[#121212]">
                        {formatRupiah(ord.payableAmount)}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="capitalize text-[11px] text-gray-500">
                        Metode: {ord.paymentMethod === 'balance' ? 'Saldo Akun' : 'QRIS'}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isDelivered && ord.credentials ? (
                      <button
                        onClick={() => setSelectedOrder(ord)}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#FFDE00]" />
                        <span>Lihat Akun</span>
                      </button>
                    ) : !isPaid && !isExpired ? (
                      <Link
                        href={`/order/${ord.orderCode}`}
                        className="px-4 py-2.5 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] active:scale-95 text-[#121212] font-black text-xs shadow-sm transition-all flex items-center gap-1.5"
                      >
                        <span>Bayar Sekarang</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <Link
                        href={`/order/${ord.orderCode}`}
                        className="px-3.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
                      >
                        Detail
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: View Delivered Credentials */}
        {selectedOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
            onClick={() => setSelectedOrder(null)}
          >
            <div
              className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-[#121212]">
                    Data Akun Digital
                  </h3>
                  <span className="text-[11px] text-gray-500">{selectedOrder.productName}</span>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-black"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200">
                <pre className="font-mono text-xs text-gray-800 whitespace-pre-wrap break-all leading-relaxed">
                  {selectedOrder.credentials}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-gray-500 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Garansi Aktif
                </span>
                <button
                  onClick={() => handleCopyCredentials(selectedOrder.credentials!)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#121212] text-white text-xs font-bold hover:bg-[#252525] active:scale-95 transition-all"
                >
                  {copiedKey ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Berhasil Disalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Kredensial</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
