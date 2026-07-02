'use client';

/**
 * 5-card top-of-page stat strip for the Active Customer Page.
 *
 * Per PRD §04 line 213: LTV / MRR / Contracts / Projects / Health Score.
 * The 5th card hosts the SVG <CustomerHealthRing>.
 *
 * Loading: each card shows a Skeleton matching its final shape so the
 * grid doesn't reflow when data arrives. `kpis`/`health` may be undefined
 * during the first load — the parent passes `isLoading` to indicate that.
 */

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, Repeat, FileText, Briefcase } from 'lucide-react';
import { formatCurrencyMap } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { CustomerHealthRing } from './customer-health-ring';
import type { DossierTopLevelKPIs, DossierHealthScore } from '@/hooks/useCustomerDossier';

interface Props {
  kpis?: DossierTopLevelKPIs;
  health?: DossierHealthScore;
  isLoading?: boolean;
}

const HEALTH_LABEL_AR: Record<DossierHealthScore['color'], string> = {
  emerald: 'ممتاز',
  amber:   'جيد',
  orange:  'متوسط',
  red:     'يحتاج اهتمام',
};

const HEALTH_LABEL_TONE: Record<DossierHealthScore['color'], string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber:   'text-amber-600 dark:text-amber-400',
  orange:  'text-orange-600 dark:text-orange-400',
  red:     'text-red-600 dark:text-red-400',
};

export function CustomerStatStrip({ kpis, health, isLoading = false }: Props) {
  const currency = kpis?.currency ?? 'AED';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard
        icon={<Wallet className="size-5" />}
        tone="orange"
        label="القيمة الكلية"
        value={isLoading ? null : (kpis ? formatCurrencyMap(kpis.ltv_by_currency, currency) : '—')}
        sub="مدفوع تراكميًا"
      />
      <StatCard
        icon={<Repeat className="size-5" />}
        tone="emerald"
        label="MRR"
        value={isLoading ? null : (kpis ? formatCurrencyMap(kpis.mrr_by_currency, currency) : '—')}
        sub="شهريًا"
      />
      <StatCard
        icon={<FileText className="size-5" />}
        tone="indigo"
        label="العقود"
        value={isLoading ? null : (kpis ? `${kpis.contracts_count}` : '—')}
        sub={kpis ? `${kpis.active_contracts_count} نشط` : undefined}
        valueIsNumeric
      />
      <StatCard
        icon={<Briefcase className="size-5" />}
        tone="amber"
        label="المشاريع"
        value={isLoading ? null : (kpis ? `${kpis.projects_count}` : '—')}
        valueIsNumeric
      />
      {/* Health Score card with embedded ring */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">صحة العميل</div>
            {isLoading || !health ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <div className={cn('mt-1 text-base font-semibold', HEALTH_LABEL_TONE[health.color])}>
                {HEALTH_LABEL_AR[health.color]}
              </div>
            )}
            {!isLoading && health && (
              <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                {health.score}/100
              </div>
            )}
          </div>
          {isLoading || !health ? (
            <Skeleton className="size-16 rounded-full shrink-0" />
          ) : (
            <CustomerHealthRing
              score={health.score}
              color={health.color}
              className="size-16 shrink-0"
            />
          )}
        </div>
      </Card>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  tone: 'orange' | 'emerald' | 'indigo' | 'amber';
  label: string;
  /** null = loading, undefined = no data (renders '—'), string = render */
  value: string | null;
  sub?: string;
  valueIsNumeric?: boolean;
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  orange:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function StatCard({ icon, tone, label, value, sub, valueIsNumeric }: StatCardProps) {
  return (
    <Card className="p-4">
      <div className={cn('size-9 rounded-lg flex items-center justify-center mb-3', TONE_CLASSES[tone])}>
        {icon}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {value === null ? (
        <Skeleton className="h-7 w-24 mt-1" />
      ) : (
        <div className={cn('mt-1 text-xl font-bold tracking-tight', valueIsNumeric && 'tabular-nums')}>
          {value}
        </div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
