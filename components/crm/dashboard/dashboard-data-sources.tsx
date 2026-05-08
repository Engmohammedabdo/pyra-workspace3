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

import { useCRMKPIs } from '@/hooks/useCRMDashboard';
import { Database } from 'lucide-react';

const SOURCES = ['pyra_sales_leads', 'pyra_payments', 'pyra_contracts'] as const;

function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  // ar-AE locale gives Arabic-Indic digits in some browsers; force ar-EG to
  // get readable Latin digits while keeping Arabic AM/PM markers consistent.
  return d.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function DashboardDataSources() {
  const { dataUpdatedAt } = useCRMKPIs('this_month');
  const refreshedAt = formatTime(dataUpdatedAt);

  return (
    <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground border-t border-border pt-4 mt-2">
      <Database className="size-3.5 shrink-0" aria-hidden />
      <span>
        تم تحديث البيانات الساعة <span className="font-medium tabular-nums">{refreshedAt}</span>
      </span>
      <span className="text-muted-foreground/60">·</span>
      <span className="flex flex-wrap items-center gap-1.5">
        المصادر:
        {SOURCES.map((src, i) => (
          <span key={src} className="inline-flex items-center gap-1.5">
            <code className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">{src}</code>
            {i < SOURCES.length - 1 && <span className="text-muted-foreground/60">،</span>}
          </span>
        ))}
      </span>
    </footer>
  );
}
