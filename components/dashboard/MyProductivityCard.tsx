'use client';

import { useMyProductivity } from '@/hooks/useProductivity';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn('text-lg font-bold', danger && 'text-red-500')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Compact current-month stats strip for the my-tasks page. */
export function MyProductivityCard() {
  const { data, isLoading } = useMyProductivity();
  if (isLoading) return <Skeleton className="h-20 w-full" />;

  const me = data?.employees[0];
  if (!me || (me.tasks.length === 0)) return null; // not a production employee — render nothing

  const m = me.metrics;
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="size-4 text-orange-500" aria-hidden />
        <h3 className="text-sm font-semibold">إنتاجيتي هذا الشهر</h3>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <Stat label="تسليمات" value={String(m.deliveries)} />
        <Stat label="الالتزام" value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`} />
        <Stat label="جولات تعديل" value={m.avg_rounds === null ? '—' : String(m.avg_rounds)} />
        <Stat label="سرعة أول نسخة" value={m.avg_days_to_first_submission === null ? '—' : `${m.avg_days_to_first_submission}ي`} />
        <Stat label="متأخرة بلا رفع" value={String(m.open_overdue)} danger={m.open_overdue > 0} />
      </div>
    </Card>
  );
}
