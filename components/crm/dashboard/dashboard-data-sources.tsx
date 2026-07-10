'use client';

/**
 * Transparency footer at the bottom of the Sales Dashboard.
 *
 * Per CRM Phase 8 spec (Cluster 1): "Data refreshed at HH:MM. Sources:
 * pyra_sales_leads, pyra_payments, pyra_contracts."
 *
 * `dataUpdatedAt` from React Query gives us the timestamp of the last
 * successful KPI fetch — the most relevant proxy for "when was this
 * dashboard's data refreshed?" because KPIs are the hottest hook
 * (refetchInterval 60s per CLAUDE.md "CRM Caching Conventions").
 */

import { useTranslations, useLocale } from 'next-intl';
import { useCRMKPIs } from '@/hooks/useCRMDashboard';
import { Database } from 'lucide-react';
import type { Locale } from '@/lib/i18n/config';

const SOURCES = ['pyra_sales_leads', 'pyra_payments', 'pyra_contracts'] as const;

/**
 * LOCKED (Phase 3.2 decision, per i18n Phase 3 plan Global Constraints):
 * this local `formatTime` stays local — do NOT consolidate with the shared
 * `formatTime` in lib/utils/format.ts (that one takes Asia/Dubai timeZone +
 * ar-AE/en-AE; this one intentionally has no timeZone override, matching the
 * pre-migration behavior byte-for-byte). Only the locale string is threaded
 * through in place. `ar-EG`/`en-US` both give Latin digits; `ar-EG` keeps the
 * Arabic AM/PM markers the original comment called out.
 */
function formatTime(ts: number, locale: Locale): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function DashboardDataSources() {
  const t = useTranslations('crm.dashboard.dataSources');
  const locale = useLocale() as Locale;
  const { dataUpdatedAt } = useCRMKPIs('this_month');
  const refreshedAt = formatTime(dataUpdatedAt, locale);

  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground border-t border-border pt-4 mt-2">
      <Database className="size-3.5 shrink-0" aria-hidden />
      <span>
        {t.rich('updatedAt', {
          timeValue: refreshedAt,
          t: (chunks) => <span className="font-medium tabular-nums font-mono">{chunks}</span>,
        })}
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span className="flex flex-wrap items-center gap-1.5">
        {t('sourcesLabel')}
        {SOURCES.map((src, i) => (
          <span key={src} className="inline-flex items-center gap-1.5">
            <code className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">{src}</code>
            {i < SOURCES.length - 1 && <span className="text-muted-foreground/60">{t('separator')}</span>}
          </span>
        ))}
      </span>
    </footer>
  );
}
