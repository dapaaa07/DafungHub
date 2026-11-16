import { Suspense } from 'react';
import OrderClient from './OrderClient';
import Footer from '@/components/Footer';
import { Loader2 } from 'lucide-react';

export const instant = false;

export default async function OrderPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#FFDE00]" />
          </main>
          <Footer />
        </div>
      }
    >
      <OrderClient code={code} />
    </Suspense>
  );
}
