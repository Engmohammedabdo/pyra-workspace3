'use client';

/**
 * Funnel visualisation — one row per pipeline stage, horizontal bar with
 * width proportional to count / max(count). Click a row → navigate to the
 * pipeline filtered by that stage.
 *
 * Per CRM Phase 8 spec (Cluster 2) and PRD §05 line 345:
 *   "Funnel viz with click-through to filtered Pipeline"
 *
 * Stages render in PIPELINE_STAGE_ORDER (the natural left-to-right pipeline
 * progression: new_inquiry → discovery → proposal → negotiation →
 * contract_signed → closed_won → closed_lost). Per-stage colours match the
 * workspace's pipeline-board.tsx convention so the viz reads consistently
 * across pages.
 *
 * Empty state: shown only when ALL stages have count=0 (no leads yet).
 * Stages with count=0 in a non-empty funnel still render with a thin
 * placeholder bar — the row is informational ("0 deals at this stage" is
 * meaningful) and clickable to inspect that stage in the pipeline.
 */

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useCRMFunnel } from '@/hooks/useCRMDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { GitBranch } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

// Map the stage's DB color token → a bar color. Covers BOTH the canonical
// palette (violet/sky/…/gold/stone) AND the settings custom palette
// (blue/yellow/purple/green/red/gray/pink/brown). Unknown → orange fallback.
const COLOR_BAR: Record<string, string> = {
  violet: 'bg-violet-500', sky: 'bg-sky-500', indigo: 'bg-indigo-500',
  amber: 'bg-amber-500', orange: 'bg-orange-500', emerald: 'bg-emerald-500',
  gold: 'bg-yellow-500', stone: 'bg-stone-500',
  blue: 'bg-blue-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500',
  green: 'bg-green-500', red: 'bg-red-500', gray: 'bg-gray-500',
  pink: 'bg-pink-500', brown: 'bg-amber-700',
};

export function DashboardFunnel() {
  const t = useTranslations('crm.dashboard.funnel');
  const locale = useLocale();
  const { data, isLoading } = useCRMFunnel();

  if (isLoading) {
    return (
      <Card className="p-5 rounded-2xl space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const stages = data?.stages ?? [];
  const allEmpty = stages.length === 0 || stages.every((s) => s.count === 0);

  if (allEmpty) {
    return (
      <Card className="p-5 rounded-2xl">
        <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          {t('heading')}
        </h2>
        <EmptyState
          icon={GitBranch}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      </Card>
    );
  }

  // Bar widths are proportional to count, with a minimum so 0-count stages
  // still render a faint placeholder bar (the row remains clickable + the
  // count text is visible).
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <Card className="p-5 rounded-2xl">
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
        <GitBranch className="size-4 text-muted-foreground" />
        {t('heading')}
      </h2>
      <ul className="space-y-3">
        {stages.map((stage) => {
          const widthPct = stage.count > 0 ? Math.max((stage.count / maxCount) * 100, 8) : 4;
          const barColor = COLOR_BAR[stage.color] ?? 'bg-orange-500';
          const isEmpty = stage.count === 0;
          const label = locale === 'ar' ? stage.name_ar : (stage.name || stage.name_ar);
          return (
            <li key={stage.stage_id}>
              <Link
                href={`/dashboard/crm/pipeline?stage=${stage.stage_id}`}
                className={cn(
                  'block group rounded-lg p-2 -m-2 transition-colors',
                  'hover:bg-muted/50',
                  'focus:outline-none focus:ring-2 focus:ring-orange-500/40',
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className={cn(
                    'text-sm font-medium truncate',
                    isEmpty && 'text-muted-foreground',
                  )}>
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {t('count', { count: stage.count })}
                    {stage.total_value > 0 && (
                      <> · {formatCurrency(stage.total_value, data?.currency ?? 'AED')}</>
                    )}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      barColor,
                      isEmpty && 'opacity-40',
                    )}
                    style={{ width: `${widthPct}%` }}
                    aria-label={t('barAria', { count: stage.count, stage: label })}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
