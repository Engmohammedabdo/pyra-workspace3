'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import QuoteBuilder, { type QuoteData } from '@/components/quotes/QuoteBuilder';

export default function EditQuotePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/quotes/${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.data) setQuote(json.data as QuoteData);
        else router.push('/dashboard/quotes');
      })
      .catch(() => router.push('/dashboard/quotes'))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] max-w-[900px] mx-auto" />
      </div>
    );
  }

  if (!quote) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          تعديل عرض السعر — {quote.quote_number}
        </h1>
        <p className="text-muted-foreground">تعديل بيانات عرض السعر</p>
      </div>

      <QuoteBuilder
        quote={quote}
        onSaved={() => router.push('/dashboard/quotes')}
        onClose={() => router.push('/dashboard/quotes')}
      />
    </div>
  );
}
