'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { User } from 'lucide-react';
import QuoteBuilder, { type LeadSnapshotForQuote } from '@/components/quotes/QuoteBuilder';

/**
 * Phase Q Commit 2 — Quote-from-lead prefill fix.
 *
 * Previous version (38c1ab8) only consumed `.name` from the lead API
 * response (for the badge), leaving QuoteBuilder fields empty. Real-user
 * test with Sayed surfaced this: he sent a quote to Ms: Bahaa with NULL
 * client_name/email/phone/company → PDF rendered with '---' placeholders.
 *
 * Now: fetch the FULL lead row + pass the snapshot fields to QuoteBuilder
 * via a typed `leadData` prop. QuoteBuilder applies them via a useEffect
 * that respects user edits already in progress (race-condition defense)
 * and only fires once per mount (ref-guarded against parent re-renders).
 */
export default function NewQuotePage() {
  const t = useTranslations('finance.quotes.new');
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadId = searchParams.get('lead_id') || undefined;
  const [leadName, setLeadName] = useState<string | null>(null);
  const [leadData, setLeadData] = useState<LeadSnapshotForQuote | null>(null);

  useEffect(() => {
    if (!leadId) return;
    fetch(`/api/dashboard/sales/leads/${leadId}`)
      .then((r) => r.json())
      .then((json) => {
        const lead = json?.data;
        if (!lead) return;
        // Set name for the badge (preserves previous behaviour)
        if (typeof lead.name === 'string') setLeadName(lead.name);
        // NEW: pass snapshot fields to QuoteBuilder for form prefill.
        // Lead has no `address` column (verified — convert-to-customer
        // line 190 documents this), so address stays null and the user
        // can fill it manually.
        setLeadData({
          name: typeof lead.name === 'string' ? lead.name : null,
          email: typeof lead.email === 'string' ? lead.email : null,
          phone: typeof lead.phone === 'string' ? lead.phone : null,
          company: typeof lead.company === 'string' ? lead.company : null,
        });
      })
      .catch(() => {});
  }, [leadId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
        {leadName && (
          <Badge variant="outline" className="mt-2 gap-1">
            <User className="h-3 w-3" />
            {t('linkedToLead', { leadName })}
          </Badge>
        )}
      </div>

      <QuoteBuilder
        leadId={leadId}
        leadData={leadData}
        onSaved={(id) => router.push(`/dashboard/quotes/${id}`)}
        onClose={() => router.push('/dashboard/quotes')}
      />
    </div>
  );
}
