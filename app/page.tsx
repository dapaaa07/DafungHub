import { connection } from 'next/server';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ValueProps from '@/components/ValueProps';
import ProductGrid from '@/components/ProductGrid';
import HowItWorks from '@/components/HowItWorks';
import GuaranteeSection from '@/components/GuaranteeSection';
import FaqSection from '@/components/FaqSection';
import Footer from '@/components/Footer';
import { BotStatusProvider } from '@/components/BotStatusContext';
import { getAllEnrichedProducts } from '@/lib/supplier';
import { getBotStatus } from '@/lib/settings';

export const instant = false;

export default async function HomePage() {
  await connection();

  const [products, botStatus] = await Promise.all([
    getAllEnrichedProducts(),
    getBotStatus(),
  ]);

  return (
    <BotStatusProvider initialStatus={botStatus}>
      <div className="flex flex-col min-h-screen bg-[#F8F9FA] text-[#121212]">
        {/* Top Sticky Navbar */}
        <Navbar />

        <main className="flex-1">
          {/* Hero Section */}
          <HeroSection />

          {/* 4 Value Proposition Highlights */}
          <ValueProps />

          {/* Dynamic Products Catalog Grid with Live Supplier Data */}
          <ProductGrid initialProducts={products} />

          {/* 3 Steps Ordering Guide */}
          <HowItWorks />

          {/* Guarantee & Trust Commitment */}
          <GuaranteeSection />

          {/* Interactive FAQ Accordion */}
          <FaqSection />
        </main>

        {/* Official Footer */}
        <Footer />
      </div>
    </BotStatusProvider>
  );
}
