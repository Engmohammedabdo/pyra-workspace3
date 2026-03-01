'use client';

import { useEffect, useState, useCallback } from 'react';
import { DollarSign, Briefcase, FileText, AlertTriangle, HardDrive } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { KpiCard } from './KpiCard';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';
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
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis');
      const json = await res.json();
      if (json.data) { setData(json.data); setError(false); }
    } catch (err) {
      console.error('KpiGrid fetch error:', err);
      setError(true);
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

  if (error || !data) return null;

  const revenueTrend = getTrend(data.revenue.change_percent);
  const projectsTrend = getTrend(data.active_projects.change_percent);

  return (
    <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {/* Revenue */}
      <StaggerItem>
        <KpiCard
          title="الإيرادات"
          value={formatCurrency(data.revenue.current)}
          icon={DollarSign}
          trend={{
            direction: revenueTrend,
            percent: data.revenue.change_percent,
          }}
        />
      </StaggerItem>

      {/* Active Projects */}
      <StaggerItem>
        <KpiCard
          title="المشاريع النشطة"
          value={String(data.active_projects.current)}
          icon={Briefcase}
          trend={{
            direction: projectsTrend,
            percent: data.active_projects.change_percent,
          }}
        />
      </StaggerItem>

      {/* Pending Invoices */}
      <StaggerItem>
        <KpiCard
          title="فواتير معلقة"
          value={String(data.pending_invoices.current)}
          subtitle={formatCurrency(data.pending_invoices.amount)}
          icon={FileText}
        />
      </StaggerItem>

      {/* Overdue Invoices */}
      <StaggerItem>
        <KpiCard
          title="متأخرات"
          value={String(data.overdue_invoices.current)}
          subtitle={formatCurrency(data.overdue_invoices.amount)}
          icon={AlertTriangle}
          accent="#ef4444"
        />
      </StaggerItem>

      {/* Storage */}
      <StaggerItem>
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
      </StaggerItem>
    </StaggerContainer>
  );
}

function getTrend(percent: number): 'up' | 'down' | 'neutral' {
  if (percent > 0) return 'up';
  if (percent < 0) return 'down';
  return 'neutral';
}
