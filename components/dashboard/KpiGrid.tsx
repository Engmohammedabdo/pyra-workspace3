'use client';

import { useEffect, useState, useCallback } from 'react';
import { DollarSign, Briefcase, FileText, AlertTriangle, HardDrive } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { KpiCard } from './KpiCard';
import { formatCurrency } from '@/lib/utils/format';

interface KpiData {
  revenue: { current: number; previous: number; change_percent: number };
  active_projects: { current: number; previous: number; change_percent: number };
  pending_invoices: { current: number; amount: number };
  overdue_invoices: { current: number; amount: number };
  storage_percent: number;
}

export function KpiGrid() {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis');
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch (err) {
      console.error('KpiGrid fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const revenueTrend = getTrend(data.revenue.change_percent);
  const projectsTrend = getTrend(data.active_projects.change_percent);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* Revenue */}
      <KpiCard
        title="الإيرادات"
        value={formatCurrency(data.revenue.current)}
        icon={DollarSign}
        trend={{
          direction: revenueTrend,
          percent: data.revenue.change_percent,
        }}
      />

      {/* Active Projects */}
      <KpiCard
        title="المشاريع النشطة"
        value={String(data.active_projects.current)}
        icon={Briefcase}
        trend={{
          direction: projectsTrend,
          percent: data.active_projects.change_percent,
        }}
      />

      {/* Pending Invoices */}
      <KpiCard
        title="فواتير معلقة"
        value={String(data.pending_invoices.current)}
        subtitle={formatCurrency(data.pending_invoices.amount)}
        icon={FileText}
      />

      {/* Overdue Invoices */}
      <KpiCard
        title="متأخرات"
        value={String(data.overdue_invoices.current)}
        subtitle={formatCurrency(data.overdue_invoices.amount)}
        icon={AlertTriangle}
        accent="#ef4444"
      />

      {/* Storage */}
      <KpiCard
        title="التخزين"
        value={`${data.storage_percent}%`}
        icon={HardDrive}
      >
        <Progress
          value={data.storage_percent}
          className="h-2"
        />
      </KpiCard>
    </div>
  );
}

function getTrend(percent: number): 'up' | 'down' | 'neutral' {
  if (percent > 0) return 'up';
  if (percent < 0) return 'down';
  return 'neutral';
}
