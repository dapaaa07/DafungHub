'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Clock,
  Copy,
  Check,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  Sparkles,
  MessageCircle,
  Wallet,
  Download,
  FileText,
  Image as ImageIcon,
  Eye,
  Paperclip,
} from 'lucide-react';
import { formatRupiah, CS_WHATSAPP_INTL } from '@/lib/pricing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

interface OrderDetail {
  orderCode: string;
  productName: string;
  productDescription?: string;
  paymentStatus: 'unpaid' | 'paid' | 'expired';
  fulfillmentStatus: 'pending' | 'processing' | 'delivered';
  paymentMethod: string;
  gateway: string;
  payableAmount: number;
  qrCodeUrl: string | null;
  qrString: string | null;
  checkoutUrl: string | null;
  uniqueCode: number;
  createdAt: string;
  deliveredAt: string | null;
  credentials: string | null;
  credentialsNote?: string | null;
  deliveredMedia?: {
    type: string;
    fileName: string;
    mimeType: string;
    fileUrl: string;
    downloadUrl: string;
    fileSize: number | null;
    isPhoto: boolean;
    isText: boolean;
    textContent: string | null;
  } | null;
  isDelivered: boolean;
  isPaid: boolean;
  isExpired: boolean;
}

export default function OrderClient({ code }: { code: string }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Poll order status
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout;

    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${code}`, {
          headers: { 'Cache-Control': 'no-cache' },
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (isMounted) setError(data.error || 'Pesanan tidak ditemukan.');
          return;
        }

        if (isMounted) {
          setOrder(data.order);
          setError(null);
        }

        // Keep polling if order is unpaid or pending fulfillment
        if (
          isMounted &&
          (data.order.paymentStatus === 'unpaid' ||
            (data.order.paymentStatus === 'paid' && data.order.fulfillmentStatus !== 'delivered'))
        ) {
          timer = setTimeout(fetchOrder, 3500);
        }
      } catch (err) {
        if (isMounted) setError((err as Error).message || 'Gagal memuat pesanan.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOrder();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [code]);

  const handleCopy = (text: string, type: 'key' | 'amount' | 'code') => {
    navigator.clipboard.writeText(text);
    if (type === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === 'amount') {
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    } else {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const waHelpUrl = `https://wa.me/${CS_WHATSAPP_INTL}?text=${encodeURIComponent(
    `Halo CS Dafung Hub, saya membutuhkan bantuan terkait pesanan dengan Kode: ${code}`
  )}`;

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:py-12">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Beranda</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-gray-200 shadow-sm space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-[#FFDE00] mx-auto" />
            <p className="text-sm font-bold text-gray-600">Memuat status pesanan...</p>
          </div>
        ) : error || !order ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-red-200 shadow-sm space-y-4">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <h2 className="text-lg font-black text-gray-800">Pesanan Tidak Ditemukan</h2>
            <p className="text-xs text-gray-600">{error || 'Kode pesanan tidak valid atau telah dihapus.'}</p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 rounded-xl bg-[#121212] text-white font-bold text-xs"
            >
              Buka Katalog Produk
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top Status Card */}
            <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              {/* Header Ribbon based on status */}
              {order.isDelivered ? (
                <div className="p-4 sm:p-5 bg-emerald-600 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="p-1 rounded-lg bg-white/20">
                      <CheckCircle2 className="w-5 h-5 text-white" />
                    </span>
                    <div>
                      <h1 className="text-sm sm:text-base font-black">Pesanan Selesai (Delivered)</h1>
                      <span className="text-[11px] text-emerald-100">
                        Akun digital Anda telah dikirim dan siap digunakan!
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white text-emerald-800 text-[10px] font-black uppercase">
                    Sukses
                  </span>
                </div>
              ) : order.isPaid ? (
                <div className="p-4 sm:p-5 bg-blue-600 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <div>
                      <h1 className="text-sm sm:text-base font-black">Pembayaran Berhasil Dikonfirmasi</h1>
                      <span className="text-[11px] text-blue-100">
                        Sistem sedang memproses penyiapan akun digital Anda...
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white text-blue-800 text-[10px] font-black uppercase">
                    Memproses
                  </span>
                </div>
              ) : order.isExpired ? (
                <div className="p-4 sm:p-5 bg-red-600 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-5 h-5 text-white" />
                    <div>
                      <h1 className="text-sm sm:text-base font-black">Invoice Kedaluwarsa</h1>
                      <span className="text-[11px] text-red-100">
                        Waktu pembayaran telah habis. Silakan pesan ulang.
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white text-red-800 text-[10px] font-black uppercase">
                    Expired
                  </span>
                </div>
              ) : (
                <div className="p-4 sm:p-5 bg-[#121212] text-white flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#FFDE00] animate-pulse" />
                    <div>
                      <h1 className="text-sm sm:text-base font-black">Menunggu Pembayaran</h1>
                      <span className="text-[11px] text-gray-300">
                        Scan QRIS di bawah dengan aplikasi perbankan atau e-wallet Anda
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-[#FFDE00] text-[#121212] text-[10px] font-black uppercase">
                    Belum Bayar
                  </span>
                </div>
              )}

              {/* Order Info Details */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Kode Pesanan
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm sm:text-base font-bold text-[#121212]">
                        {order.orderCode}
                      </span>
                      <button
                        onClick={() => handleCopy(order.orderCode, 'code')}
                        className="text-gray-400 hover:text-black p-1 transition-colors"
                        title="Salin Kode Order"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                      Produk
                    </span>
                    <span className="text-sm sm:text-base font-extrabold text-[#121212]">
                      {order.productName}
                    </span>
                  </div>
                </div>

                {/* Delivered Credentials or Deposit Confirmation Card */}
                {order.isDelivered && (
                  order.productName.toLowerCase().includes('deposit') ? (
                    <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <Wallet className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-emerald-900 font-extrabold text-sm sm:text-base">
                            Top-Up Saldo Berhasil Masuk!
                          </h3>
                          <p className="text-xs text-emerald-700 mt-0.5">
                            Saldo akun Anda telah bertambah secara otomatis dan siap digunakan untuk transaksi.
                          </p>
                        </div>
                      </div>

                      {order.credentials && (
                        <div className="p-3.5 bg-white rounded-xl border border-emerald-200">
                          <pre className="font-mono text-xs text-gray-800 whitespace-pre-wrap break-all leading-relaxed">
                            {order.credentials}
                          </pre>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Link
                          href="/account"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-sm transition-all"
                        >
                          <Wallet className="w-4 h-4" />
                          <span>Cek Saldo di Akun Saya</span>
                        </Link>
                        <Link
                          href="/"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-emerald-100/50 border border-emerald-300 text-emerald-800 font-bold text-xs sm:text-sm transition-all"
                        >
                          <span>Beli Layanan Sekarang</span>
                        </Link>
                      </div>
                    </div>
                  ) : (order.deliveredMedia || order.credentials) ? (
                    <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 space-y-4">
                      {/* Header with Title and Actions */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-xs sm:text-sm">
                          {order.deliveredMedia ? (
                            <Paperclip className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-emerald-600" />
                          )}
                          <span>
                            {order.deliveredMedia
                              ? order.deliveredMedia.isPhoto
                                ? 'Media Gambar Kredensial Akun:'
                                : 'File Lampiran & Kredensial Akun:'
                              : 'Kredensial Akun Digital Anda:'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {order.deliveredMedia && (
                            <a
                              href={order.deliveredMedia.downloadUrl}
                              download={order.deliveredMedia.fileName}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 active:scale-95 text-emerald-800 font-bold text-xs shadow-sm transition-all"
                            >
                              <Download className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Unduh File</span>
                            </a>
                          )}

                          {order.credentials && (
                            <button
                              onClick={() => handleCopy(order.credentials!, 'key')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all"
                            >
                              {copiedKey ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Tersalin!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Salin Akun</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* MEDIA ATTACHMENT DISPLAY */}
                      {order.deliveredMedia && (
                        <div className="space-y-3">
                          {/* If Image: Render Image Preview */}
                          {order.deliveredMedia.isPhoto ? (
                            <div className="rounded-2xl border-2 border-emerald-200 bg-white p-3 space-y-3 shadow-xs">
                              <div className="relative group max-h-[420px] rounded-xl overflow-hidden bg-gray-50 flex items-center justify-center border border-gray-100">
                                <img
                                  src={order.deliveredMedia.fileUrl}
                                  alt={order.deliveredMedia.fileName}
                                  className="max-h-[380px] w-auto object-contain rounded-lg"
                                />
                              </div>
                              <div className="flex items-center justify-between text-xs text-gray-600 pt-1">
                                <span className="font-semibold truncate max-w-[200px] sm:max-w-xs text-gray-800 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  {order.deliveredMedia.fileName}
                                </span>
                                <div className="flex items-center gap-2">
                                  <a
                                    href={order.deliveredMedia.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-bold hover:underline"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    <span>Buka Penuh</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          ) : (
                            /* If Document / File */
                            <div className="p-3.5 bg-white rounded-xl border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                                  <FileText className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-extrabold text-xs sm:text-sm text-gray-900 block truncate">
                                    {order.deliveredMedia.fileName}
                                  </span>
                                  <span className="text-[11px] text-gray-500 font-medium">
                                    Lampiran Berkas Akun Digital
                                    {order.deliveredMedia.fileSize ? ` • ${(order.deliveredMedia.fileSize / 1024).toFixed(1)} KB` : ''}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                <a
                                  href={order.deliveredMedia.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Buka</span>
                                </a>
                                <a
                                  href={order.deliveredMedia.downloadUrl}
                                  download={order.deliveredMedia.fileName}
                                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Unduh File</span>
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* TEXT CREDENTIALS / FILE CONTENT */}
                      {order.credentials && (
                        <div className="space-y-1.5">
                          {order.deliveredMedia && (
                            <span className="text-[11px] font-bold text-emerald-900 block">
                              {order.deliveredMedia.isText ? 'Isi Teks Berkas Kredensial:' : 'Keterangan Tambahan:'}
                            </span>
                          )}
                          <div className="p-3.5 bg-white rounded-xl border border-emerald-200">
                            <pre className="font-mono text-xs text-gray-800 whitespace-pre-wrap break-all leading-relaxed">
                              {order.credentials}
                            </pre>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-emerald-800">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Simpan data akun di tempat aman. Garansi berlaku selama durasi paket aktif.
                        </span>
                      </div>
                    </div>
                  ) : null
                )}

                {/* UNPAID QRIS SECTION */}
                {!order.isPaid && !order.isExpired && (
                  <div className="space-y-6 pt-2">
                    {/* Exact Amount Notice */}
                    <div className="p-4 rounded-2xl bg-yellow-50 border border-yellow-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] text-yellow-800 font-semibold block">
                          Total Pembayaran (Transfer Sesuai Nominal):
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-2xl sm:text-3xl font-black text-[#121212]">
                            {formatRupiah(order.payableAmount)}
                          </span>
                          <button
                            onClick={() => handleCopy(String(order.payableAmount), 'amount')}
                            className="p-1.5 rounded-lg bg-yellow-200/70 hover:bg-yellow-300 text-yellow-900 transition-colors"
                            title="Salin Jumlah Bayar"
                          >
                            {copiedAmount ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        {order.uniqueCode > 0 && (
                          <span className="text-[10px] text-yellow-800/80 block mt-1">
                            *Termasuk kode verifikasi otomatis: <b>+{order.uniqueCode}</b>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-yellow-300 text-xs font-bold text-gray-700">
                        <Clock className="w-3.5 h-3.5 text-yellow-600" />
                        <span>Batas Waktu: ~15 Menit</span>
                      </div>
                    </div>

                    {/* QR Code Container */}
                    {order.qrCodeUrl && (
                      <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-2xl border border-gray-200 space-y-4 text-center">
                        <div className="p-3 bg-white rounded-2xl shadow-md border border-gray-200">
                          <img
                            src={order.qrCodeUrl}
                            alt="QRIS Pembayaran"
                            className="w-56 h-56 sm:w-64 sm:h-64 object-contain mx-auto"
                          />
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs font-extrabold text-[#121212] block">
                            Scan QRIS dengan Semua E-Wallet / Mobile Banking
                          </span>
                          <p className="text-[11px] text-gray-500 max-w-sm">
                            BCA, Mandiri, BRI, BNI, ShopeePay, GoPay, OVO, DANA, LinkAja, Livin, dll.
                          </p>
                        </div>

                        {order.checkoutUrl && (
                          <a
                            href={order.checkoutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FFDE00] hover:bg-[#FFE838] text-[#121212] text-xs font-bold shadow-sm transition-all"
                          >
                            <span>Buka di Aplikasi E-Wallet</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    )}

                    {/* Auto-detect Notice */}
                    <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between text-xs text-blue-900">
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                        <span>Sistem memantau pembayaran otomatis... Halaman ini akan ter-update seketika setelah Anda bayar.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Need Help Box */}
            <div className="p-4 bg-white rounded-2xl border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-gray-600">
                <MessageCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Ada pertanyaan atau kendala pembayaran? Tim kami siap membantu.</span>
              </div>
              <a
                href={waHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold shrink-0 transition-colors"
              >
                <span>Hubungi CS WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
