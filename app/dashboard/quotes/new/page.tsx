'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';
import QuoteBuilder from '@/components/quotes/QuoteBuilder';

export default function NewQuotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get('lead_id') || undefined;
  const [leadName, setLeadName] = useState<string | null>(null);

  useEffect(() => {
    if (leadId) {
      fetch(`/api/dashboard/sales/leads/${leadId}`)
        .then(r => r.json())
        .then(json => {
          if (json.data?.name) setLeadName(json.data.name);
        })
        .catch(() => {});
    }
  }, [leadId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">عرض سعر جديد</h1>
        <p className="text-muted-foreground">إنشاء عرض سعر جديد للعميل</p>
        {leadName && (
          <Badge variant="outline" className="mt-2 gap-1">
            <User className="h-3 w-3" />
            مرتبط بالعميل المحتمل: {leadName}
          </Badge>
        )}
      </div>

      <QuoteBuilder
        leadId={leadId}
        onSaved={(id) => router.push(`/dashboard/quotes/${id}`)}
        onClose={() => router.push('/dashboard/quotes')}
      />
    </div>
  );
}
