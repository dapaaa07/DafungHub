import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Inter } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-heading',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dafung-hub.vercel.app'),
  title: 'Dafung Hub — Pusat Langganan & Produk Digital Premium',
  description:
    'Platform resmi langganan produk digital premium: Netflix, CapCut, Canva, Claude AI, Gemini, Office 365, VPN, dan banyak lagi. Proses cepat, garansi full durasi, order otomatis via Telegram Bot & WhatsApp.',
  keywords: [
    'dafung hub',
    'akun netflix murah',
    'canva pro',
    'capcut pro',
    'claude ai pro',
    'gemini advanced',
    'office 365',
    'vpn premium',
    'langganan digital',
    'store dafung',
  ],
  openGraph: {
    title: 'Dafung Hub — Pusat Langganan Digital Premium',
    description: 'Beli akun digital premium garansi full durasi. Proses instan otomatis.',
    url: 'https://dafung-hub.vercel.app',
    siteName: 'Dafung Hub',
    images: [
      {
        url: '/banner.png',
        width: 1024,
        height: 764,
        alt: 'Dafung Hub Banner',
      },
    ],
    locale: 'id_ID',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-[#F8F9FA] text-[#121212] antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
