'use client';

/**
 * /dashboard/crm/whatsapp-report — sales team WhatsApp report (Task 8's
 * aggregator). Mirrors app/dashboard/crm/calls/calls-client.tsx: month
 * picker defaults to the current Dubai month; the API OMITS agents with
 * zero WhatsApp activity in the selected month, so `agents.length === 0`
 * is the true empty state (not "no agents exist").
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useWhatsappReport } from '@/hooks/useWhatsappReport';
import { dubaiDayKey } from '@/lib/utils/format';
import { WaSummaryCards } from './wa-summary-cards';
import { WaByDayChart } from './wa-by-day-chart';

export function WhatsappReportClient() {
  const t = useTranslations('whatsapp-report');
  const [month, setMonth] = useState(() => dubaiDayKey().slice(0, 7));
  const { data, isLoading } = useWhatsappReport(month);

  const agents = data?.agents ?? [];
  const perDay = data?.per_day ?? {};
  const scope = data?.scope ?? 'own';

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <MessageCircle className="size-5 text-orange-500" aria-hidden />
            {t('title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="whatsapp-report-month" className="text-sm text-muted-foreground">
            {t('monthLabel')}
          </label>
          <input
            id="whatsapp-report-month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label={t('monthLabel')}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState icon={MessageCircle} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          <WaByDayChart perDay={perDay} />
          <WaSummaryCards agents={agents} scope={scope} />
        </>
      )}
    </div>
  );
}
