'use client';

import { useRouter } from 'next/navigation';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';

export default function NewQuotePage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">عرض سعر جديد</h1>
        <p className="text-muted-foreground">إنشاء عرض سعر جديد للعميل</p>
      </div>

      <QuoteBuilder
        onSaved={(id) => router.push(`/dashboard/quotes/${id}`)}
        onClose={() => router.push('/dashboard/quotes')}
      />
    </div>
  );
}
