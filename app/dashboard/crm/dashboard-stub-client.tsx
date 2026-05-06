'use client';

/**
 * Phase 4 stub for /dashboard/crm.
 *
 * Phase 8 will replace this with the full Sales Dashboard (KPI cards, AI
 * Insights banner, Funnel viz, Deals at Risk, Team Performance, etc.).
 *
 * For now we render a few live KPI numbers from /api/crm/dashboard/kpis so
 * the page is more than a stub — it confirms the endpoint and the lock-in
 * win-probability math actually work end-to-end.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useCRMKPIs, useCRMFunnel } from '@/hooks/useCRMDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Target, TrendingUp, Wallet, Repeat, ArrowRightCircle, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { AddLeadModal } from '@/components/crm/add-lead-modal/add-lead-modal';

export function CrmDashboardStub() {
  const { data: kpis, isLoading: kpisLoading } = useCRMKPIs('this_month');
  const { data: funnel } = useCRMFunnel();
  const [addLeadOpen, setAddLeadOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">لوحة المبيعات</h1>
            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/40">
              Phase 4 · معاينة
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            النسخة النهائية بكامل الـ KPIs والـ AI Insights جاية في Phase 8. هنا أرقام أولية لاختبار النظام.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddLeadOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="size-4 me-2" /> Lead جديد
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/crm/pipeline">
              <GitBranch className="size-4 me-2" />
              فتح خط المبيعات
              <ArrowRightCircle className="size-4 ms-2" />
            </Link>
          </Button>
        </div>
      </header>

      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          loading={kpisLoading}
          icon={<Wallet className="size-5" />}
          label="قيمة خط المبيعات"
          value={kpis?.pipeline_value.total_aed ?? 0}
          sub={`${kpis?.pipeline_value.count ?? 0} صفقة نشطة`}
          tone="orange"
        />
        <KpiCard
          loading={kpisLoading}
          icon={<TrendingUp className="size-5" />}
          label="فوز هذا الشهر"
          value={kpis?.closed_won.total_aed ?? 0}
          sub={`${kpis?.closed_won.count ?? 0} صفقة (cash basis)`}
          tone="emerald"
        />
        <KpiCard
          loading={kpisLoading}
          icon={<Target className="size-5" />}
          label="توقعات الإغلاق"
          value={kpis?.forecast_close_value ?? 0}
          sub="مبني على win_probability"
          tone="indigo"
        />
        <KpiCard
          loading={kpisLoading}
          icon={<Repeat className="size-5" />}
          label="MRR — الاحتفاظات النشطة"
          value={kpis?.monthly_recurring_revenue ?? 0}
          sub="معتمد على pyra_contracts"
          tone="amber"
        />
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold mb-3">توزيع الصفقات على المراحل</h2>
        {!funnel ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : (
          <ul className="space-y-2">
            {funnel.stages.map((s) => (
              <li key={s.stage_id} className="flex items-center justify-between text-sm border-b border-border last:border-0 pb-2 last:pb-0">
                <span className="font-medium">{s.label_ar}</span>
                <span className="text-muted-foreground">
                  {s.count} {s.count === 1 ? 'صفقة' : 'صفقات'} · {formatCurrency(s.total_value, 'AED')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 bg-muted/30 border-dashed">
        <p className="text-sm text-muted-foreground leading-7">
          <strong>ملاحظة Phase 4:</strong> الأرقام تظهر صفر لأن الـ leads الحالية (21 lead) ما عندهاش
          <code className="mx-1 px-1.5 py-0.5 rounded bg-muted text-xs">expected_value</code>
          لسه. أول ما السايد يبدأ يحدّث المراحل ويضيف القيم بعد الإطلاق، الأرقام هتشتغل تلقائيًا.
          ده مقصود (قرار Q-DB-002).
        </p>
      </Card>
    </div>
  );
}

interface KpiCardProps {
  loading?: boolean;
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone: 'orange' | 'emerald' | 'indigo' | 'amber';
}

function KpiCard({ loading, icon, label, value, sub, tone }: KpiCardProps) {
  const toneClasses: Record<KpiCardProps['tone'], string> = {
    orange:  'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    indigo:  'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    amber:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className={`size-9 rounded-lg flex items-center justify-center ${toneClasses[tone]}`}>{icon}</div>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <Skeleton className="h-7 w-24 mt-1" />
      ) : (
        <div className="text-2xl font-bold tracking-tight tabular-nums mt-1">
          {formatCurrency(value, 'AED')}
        </div>
      )}
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}
