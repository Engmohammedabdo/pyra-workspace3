'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Star, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { HROverview } from '@/hooks/useHROverview';

interface EvaluationsStatusCardProps {
  evaluations: HROverview['evaluations'];
}

interface StatPillProps {
  label: string;
  value: number;
  colorClass: string;
}

function StatPill({ label, value, colorClass }: StatPillProps) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-xl border', colorClass)}>
      <span className="text-xl font-bold leading-none">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function EvaluationsStatusCard({ evaluations }: EvaluationsStatusCardProps) {
  const t = useTranslations('hr.overview.evaluationsStatus');
  const hasActivePeriod = Boolean(evaluations.active_period);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Section header — section-header-as-link pattern */}
      <Link
        href="/dashboard/evaluations"
        aria-label={t('openAria')}
        className={cn(
          'group flex items-center justify-between px-5 py-4 border-b border-border/40',
          'hover:bg-muted/50 transition-colors cursor-pointer',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-md shadow-yellow-500/15">
            <Star className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm">{t('title')}</h3>
            {hasActivePeriod && (
              // active_period is a server-computed display string (per-request
              // locale, resolved in /api/hr/overview from the DB row's
              // name/name_ar) — rendered verbatim, not translated client-side.
              <p className="text-xs text-muted-foreground mt-0.5">{evaluations.active_period}</p>
            )}
          </div>
        </div>
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-90"
          aria-hidden
        />
      </Link>

      {/* Body */}
      <div className="p-5">
        {hasActivePeriod ? (
          <div className="grid grid-cols-3 gap-3">
            <StatPill
              label={t('pending')}
              value={evaluations.pending}
              colorClass="bg-yellow-50/80 dark:bg-yellow-950/30 border-yellow-200/60 dark:border-yellow-800/40 text-yellow-700 dark:text-yellow-400"
            />
            <StatPill
              label={t('submitted')}
              value={evaluations.submitted}
              colorClass="bg-blue-50/80 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/40 text-blue-700 dark:text-blue-400"
            />
            <StatPill
              label={t('acknowledged')}
              value={evaluations.acknowledged}
              colorClass="bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400"
            />
          </div>
        ) : (
          /* Phase 13 compact inline stub — no active evaluation period */
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{t('noActivePeriod')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
