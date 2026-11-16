import type { Metadata } from 'next';
import { connection } from 'next/server';

export const instant = false;

export const metadata: Metadata = {
  title: 'Akun Pelanggan — Dafung Hub',
  description: 'Kelola profil, saldo dompet, dan keanggotaan VIP Dafung Hub.',
};

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return children;
}
