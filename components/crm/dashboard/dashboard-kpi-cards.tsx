'use client';

/**
 * 4-card KPI grid at the top of the Sales Dashboard.
 *
 * Per CRM Phase 8 spec (Cluster 2) and PRD §04 line 272:
 *   "4-card grid (pipeline, closed won, conv rate, avg deal)"
 *
 * Cards:
 *   1. Pipeline value     (currency, AED)
 *   2. Closed-won period  (currency, AED — cash-basis from pyra_payments)
 *   3. Conversion rate    (percentage)
 *   4. Avg deal size      (currency, AED)
 *
 * v1 LIMITATION (per CRM-PROGRESS.md "Phase 8 known limitations"):
 *   trend_pct / vs_target_pct / vs_prior_pct / trend are all hardcoded
 *   to 0 / 'flat' on the server side. Phase 8 ships honest "0%" + flat
 *   icon trend indicators. v1.1 will compute prior-period comparison
 *   + target tracking schema and these will surface meaningful values
 *   without any UI change here (the visual contract is preserved).
 */

import { useCRMKPIs, type CRMPeriod } from '@/hooks/useCRMDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Wallet, TrendingUp, Target, BarChart3, Minus, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface DashboardKpiCardsProps {
  /** Defaults to 'this_month'. dashboard-client.tsx passes the period selector value here in Step 5. */
  period?: CRMPeriod;
}

export function DashboardKpiCards({ period = 'this_month' }: DashboardKpiCardsProps) {
  const { data: kpis, isLoading } = useCRMKPIs(period);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        loading={isLoading}
        icon={<Wallet className="size-5" />}
        label="قيمة خط المبيعات"
        value={kpis ? formatCurrency(kpis.pipeline_value.total_aed, kpis.currency) : '—'}
        sub={kpis ? `${kpis.pipeline_value.count} ${kpis.pipeline_value.count === 1 ? 'صفقة نشطة' : 'صفقة نشطة'}` : undefined}
        tone="orange"
        trendPct={kpis?.pipeline_value.trend_pct ?? 0}
      />
      <KpiCard
        loading={isLoading}
        icon={<TrendingUp className="size-5" />}
        label="فوز هذه الفترة"
        value={kpis ? formatCurrency(kpis.closed_won.total_aed, kpis.currency) : '—'}
        sub={kpis ? `${kpis.closed_won.count} ${kpis.closed_won.count === 1 ? 'صفقة' : 'صفقات'}` : undefined}
        tone="emerald"
        trendPct={kpis?.closed_won.vs_target_pct ?? 0}
      />
      <KpiCard
        loading={isLoading}
        icon={<Target className="size-5" />}
        label="معدل التحويل"
        value={kpis ? `${kpis.conversion_rate.current_pct}%` : '—'}
        sub="vs الفترة السابقة"
        tone="indigo"
        trendPct={kpis?.conversion_rate.vs_prior_pct ?? 0}
      />
      <KpiCard
        loading={isLoading}
        icon={<BarChart3 className="size-5" />}
        label="متوسط حجم الصفقة"
        value={kpis ? formatCurrency(kpis.avg_deal_size.aed, kpis.currency) : '—'}
        sub="لكل صفقة نشطة"
        tone="amber"
        trendPct={0}
      />
    </div>
  );
}

interface KpiCardProps {
  loading?: boolean;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone: 'orange' | 'emerald' | 'indigo' | 'amber';
  /**
   * v1 always 0 per CRM-PROGRESS.md (trend infrastructure deferred to v1.1).
   * Visual contract: pct > 0 → up arrow + emerald, pct < 0 → down arrow + red,
   * pct === 0 → minus + muted. v1.1 will swap real numbers in here.
   */
  trendPct: number;
}

const TONE_CLASSES: Record<KpiCardProps['tone'], string> = {
  orange:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

function KpiCard({ loading, icon, label, value, sub, tone, trendPct }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={cn('size-9 rounded-lg flex items-center justify-center shrink-0', TONE_CLASSES[tone])}>
          {icon}
        </div>
        <TrendBadge pct={trendPct} />
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="h-8 w-32 mt-1" />
      ) : (
        <div className="text-2xl font-bold tracking-tight tabular-nums mt-1">{value}</div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  if (pct > 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
        <ArrowUpRight className="size-3.5" aria-hidden />
        <span>+{pct}%</span>
      </div>
    );
  }
  if (pct < 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 tabular-nums">
        <ArrowDownRight className="size-3.5" aria-hidden />
        <span>{pct}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
      <Minus className="size-3.5" aria-hidden />
      <span>0%</span>
    </div>
  );
}
