'use client';

/**
 * /dashboard/crm/calls — sales team calls report (from the company-phones
 * call-tracking pipeline, Task 6). Month picker defaults to the current
 * Dubai month; the API OMITS agents with zero calls in the selected month,
 * so `agents.length === 0` is the true empty state (not "no agents exist").
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useCallsReport } from '@/hooks/useCallsReport';
import { dubaiDayKey } from '@/lib/utils/format';
import { CallsSummaryCards } from '@/components/crm/calls/CallsSummaryCards';
import { CallsByDayChart } from '@/components/crm/calls/CallsByDayChart';
import { CallsTable } from '@/components/crm/calls/CallsTable';

export function CallsClient() {
  const t = useTranslations('calls');
  const [month, setMonth] = useState(() => dubaiDayKey().slice(0, 7));
  const { data, isLoading } = useCallsReport(month);

  const agents = data?.agents ?? [];
  const perDay = data?.per_day ?? {};

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Phone className="size-5 text-orange-500" aria-hidden />
            {t('title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="calls-report-month" className="text-sm text-muted-foreground">
            {t('monthLabel')}
          </label>
          <input
            id="calls-report-month"
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
        <EmptyState icon={Phone} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <>
          <CallsByDayChart perDay={perDay} />
          <CallsSummaryCards agents={agents} />
          <CallsTable
            month={month}
            scope={data?.scope ?? 'own'}
            agentOptions={agents.map((a) => ({ username: a.username, display_name: a.display_name }))}
          />
        </>
      )}
    </div>
  );
}
