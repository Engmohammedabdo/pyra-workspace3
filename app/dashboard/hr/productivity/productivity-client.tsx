'use client';

import { useState } from 'react';
import { useProductivityReport } from '@/hooks/useProductivity';
import type { EmployeeReport } from '@/lib/production/report';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, dubaiDayKey } from '@/lib/utils/format';
import { BarChart3, ChevronDown, Clock, PackageCheck, RefreshCcw, Timer } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function Kpi({ label, value, hint, tone = 'default' }: {
  label: string; value: string; hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      tone === 'good' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30',
      tone === 'warn' && 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30',
      tone === 'bad' && 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30',
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function onTimeTone(pct: number | null): 'default' | 'good' | 'warn' | 'bad' {
  if (pct === null) return 'default';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function EmployeeCard({ emp, month }: { emp: EmployeeReport; month: string }) {
  const [open, setOpen] = useState(false);
  const m = emp.metrics;

  // Drill-down must reconcile with the month-filtered KPI cards: show only
  // journeys whose delivery OR first-submission lands in the selected month.
  // When viewing the CURRENT month, also keep not-yet-submitted open work so
  // in-flight tasks stay visible. Month key derived the same way the metrics
  // engine buckets (dubaiDayKey → YYYY-MM) so past months reconcile exactly.
  const isCurrentMonth = month === dubaiDayKey().slice(0, 7);
  const monthOf = (iso: string) => dubaiDayKey(new Date(iso)).slice(0, 7);
  const visibleTasks = emp.tasks.filter((t) => {
    if (t.delivered_at && monthOf(t.delivered_at) === month) return true;
    if (t.first_submitted_at && monthOf(t.first_submitted_at) === month) return true;
    if (isCurrentMonth && !t.first_submitted_at && !t.delivered_at) return true;
    return false;
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{emp.display_name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          دوام: {emp.attendance.present_days} حضور · {emp.attendance.late_days} تأخير · {emp.attendance.absent_days} غياب · {emp.attendance.total_hours} ساعة
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label="تسليمات مكتملة" value={String(m.deliveries)} />
        <Kpi label="الالتزام بالمواعيد" value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`} tone={onTimeTone(m.on_time_pct)} hint="على أول رفع للمراجعة" />
        <Kpi label="متوسط التأخير" value={m.avg_delay_days === null ? '—' : `${m.avg_delay_days} يوم`} tone={m.avg_delay_days ? 'warn' : 'default'} hint={`${m.late_count} مهمة متأخرة`} />
        <Kpi label="جولات التعديل" value={m.avg_rounds === null ? '—' : String(m.avg_rounds)} hint="متوسط لكل تسليم" />
        <Kpi label="سرعة أول نسخة" value={m.avg_days_to_first_submission === null ? '—' : `${m.avg_days_to_first_submission} يوم`} hint="من إنشاء المهمة" />
        <Kpi label="انتظار مراجعتك" value={m.avg_review_wait_hours === null ? '—' : `${m.avg_review_wait_hours} س`} hint="متوسط لكل جولة" />
        <Kpi label="متأخرة ولم تُرفع" value={String(m.open_overdue)} tone={m.open_overdue > 0 ? 'bad' : 'default'} />
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        تفاصيل المهام ({visibleTasks.length})
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="p-2 text-start">المهمة</th>
                <th scope="col" className="p-2 text-start">الديدلاين</th>
                <th scope="col" className="p-2 text-start">أول رفع</th>
                <th scope="col" className="p-2 text-start">الالتزام</th>
                <th scope="col" className="p-2 text-start">جولات</th>
                <th scope="col" className="p-2 text-start">التسليم النهائي</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((t) => (
                <tr key={t.task_id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="p-2 font-medium">{t.title}</td>
                  <td className="p-2">{t.due_date ? formatDate(t.due_date) : '—'}</td>
                  <td className="p-2">{t.first_submitted_at ? formatDate(t.first_submitted_at) : '—'}</td>
                  <td className="p-2">
                    {t.on_time === null ? <span className="text-muted-foreground">—</span>
                      : t.on_time ? <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">في الموعد</Badge>
                      : <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-0">متأخر {t.delay_days} يوم</Badge>}
                  </td>
                  <td className="p-2">{t.review_rounds}</td>
                  <td className="p-2">{t.delivered_at ? formatDate(t.delivered_at) : <span className="text-muted-foreground">لم يُسلم</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ProductivityClient() {
  const [month, setMonth] = useState(dubaiDayKey().slice(0, 7));
  const { data, isLoading } = useProductivityReport(month);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="size-5 text-orange-500" aria-hidden />
            تقرير الإنتاجية
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            التسليمات والالتزام بالمواعيد وجولات التعديل والدوام — لكل موظف إنتاج
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
          aria-label="اختر الشهر"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !data?.employees.length ? (
        <EmptyState
          icon={PackageCheck}
          title="لا توجد بيانات إنتاج"
          description="لا توجد مهام على لوحة الإنتاج لهذا الشهر بعد"
        />
      ) : (
        data.employees.map((emp) => <EmployeeCard key={emp.username} emp={emp} month={month} />)
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Timer className="size-3" aria-hidden />
        الالتزام يُقاس على أول رفع للمراجعة (قرار مقفول 2026-07-03) — وقت انتظار المراجعة والجولات أرقام منفصلة.
        <RefreshCcw className="size-3 ms-2" aria-hidden />
        الأرقام مشتقة من سجل حركة المهام — لا عدادات مخزنة.
      </p>
    </div>
  );
}
