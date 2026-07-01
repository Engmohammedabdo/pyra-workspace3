'use client';

import { Users, UserCheck, Plane, ClipboardCheck, Banknote } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { formatCurrency } from '@/lib/utils/format';
import type { HROverview } from '@/hooks/useHROverview';

interface HrKpiRowProps {
  data: HROverview;
}

export function HrKpiRow({ data }: HrKpiRowProps) {
  const pendingTotal = data.pending_approvals.total;
  const pendingAccent = pendingTotal > 5 ? '#ef4444' : undefined; // red-500

  // Build a compact breakdown subtitle only when at least one sub-type is non-zero
  const { leave, expense, timesheet } = data.pending_approvals;
  const breakdownParts: string[] = [];
  if (leave > 0) breakdownParts.push(`إجازات: ${leave}`);
  if (expense > 0) breakdownParts.push(`مصاريف: ${expense}`);
  if (timesheet > 0) breakdownParts.push(`جداول: ${timesheet}`);
  const pendingSubtitle = breakdownParts.length > 0 ? breakdownParts.join(' · ') : undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* 1. Headcount */}
      <KpiCard
        title="إجمالي الموظفين"
        value={String(data.headcount.active)}
        icon={Users}
        gradient="from-blue-500 to-indigo-600"
        subtitle={`${data.headcount.new_30d} موظف جديد في آخر 30 يوم`}
      />

      {/* 2. Present today % */}
      <KpiCard
        title="الحضور اليوم"
        value={`${data.attendance_today.present_rate_pct}%`}
        icon={UserCheck}
        gradient="from-emerald-500 to-teal-600"
        subtitle={`حاضر: ${data.attendance_today.present} · غائب: ${data.attendance_today.absent}`}
      />

      {/* 3. On leave today */}
      <KpiCard
        title="في إجازة اليوم"
        value={String(data.attendance_today.on_leave)}
        icon={Plane}
        gradient="from-amber-500 to-orange-600"
      />

      {/* 4. Combined pending approvals (leave + expense + timesheet) */}
      <KpiCard
        title="موافقات معلقة"
        value={String(pendingTotal)}
        icon={ClipboardCheck}
        gradient={pendingTotal > 5 ? 'from-red-500 to-rose-600' : 'from-orange-500 to-amber-600'}
        accent={pendingAccent}
        subtitle={pendingSubtitle}
      />

      {/* 5. Monthly payroll cost — uses the currency of the last paid run */}
      <KpiCard
        title="تكلفة الرواتب الأخيرة"
        value={formatCurrency(data.payroll.last_paid_total, data.payroll.last_paid_currency)}
        icon={Banknote}
        gradient="from-purple-500 to-violet-600"
      />
    </div>
  );
}
