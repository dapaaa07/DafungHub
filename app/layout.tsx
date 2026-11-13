import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#F8F9FA] text-[#121212] antialiased flex flex-col">
        {children}
      </body>
    </html>
  );
}
