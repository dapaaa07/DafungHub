import type { Metadata } from 'next';
import { connection } from 'next/server';

export const instant = false;

export const metadata: Metadata = {
  title: 'Server Resource Monitor — Dafung Hub',
  description: 'Pantau penggunaan RAM, CPU, Disk, dan Database hosting Dafung Hub secara realtime.',
  robots: { index: false, follow: false },
};

export default async function MonitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return children;
}
