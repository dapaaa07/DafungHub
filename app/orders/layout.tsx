import type { Metadata } from 'next';
import { connection } from 'next/server';

export const instant = false;

export const metadata: Metadata = {
  title: 'Riwayat Pesanan — Dafung Hub',
  description: 'Daftar riwayat pesanan produk digital Anda di Dafung Hub.',
};

export default async function OrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return children;
}
