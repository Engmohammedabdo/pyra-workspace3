'use client';

import { useEffect, useState, useCallback } from 'react';
import { DollarSign, Briefcase, FileText, AlertTriangle, HardDrive } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { KpiCard } from './KpiCard';
import { motion } from 'framer-motion';
import { formatCurrency } from '@/lib/utils/format';

interface KpiData {
  revenue: { current: number; previous: number; change_percent: number };
  active_projects: { current: number; previous: number; change_percent: number };
  pending_invoices: { current: number; amount: number };
  overdue_invoices: { current: number; amount: number };
  storage_percent: number;
}

const containerMotion = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemMotion = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

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
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error || !data) return null;

  const revenueTrend = getTrend(data.revenue.change_percent);
  const projectsTrend = getTrend(data.active_projects.change_percent);

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      {/* Revenue */}
      <motion.div variants={itemMotion}>
        <KpiCard
          title="الإيرادات"
          value={formatCurrency(data.revenue.current)}
          icon={DollarSign}
          gradient="from-emerald-500 to-teal-600"
          trend={{
            direction: revenueTrend,
            percent: data.revenue.change_percent,
          }}
        />
      </motion.div>

      {/* Active Projects */}
      <motion.div variants={itemMotion}>
        <KpiCard
          title="المشاريع النشطة"
          value={String(data.active_projects.current)}
          icon={Briefcase}
          gradient="from-blue-500 to-indigo-600"
          trend={{
            direction: projectsTrend,
            percent: data.active_projects.change_percent,
          }}
        />
      </motion.div>

      {/* Pending Invoices */}
      <motion.div variants={itemMotion}>
        <KpiCard
          title="فواتير معلقة"
          value={String(data.pending_invoices.current)}
          subtitle={formatCurrency(data.pending_invoices.amount)}
          icon={FileText}
          gradient="from-orange-500 to-amber-600"
        />
      </motion.div>

      {/* Overdue Invoices */}
      <motion.div variants={itemMotion}>
        <KpiCard
          title="متأخرات"
          value={String(data.overdue_invoices.current)}
          subtitle={formatCurrency(data.overdue_invoices.amount)}
          icon={AlertTriangle}
          gradient="from-red-500 to-rose-600"
          accent="#ef4444"
        />
      </motion.div>

      {/* Storage */}
      <motion.div variants={itemMotion}>
        <KpiCard
          title="التخزين"
          value={`${data.storage_percent}%`}
          icon={HardDrive}
          gradient="from-violet-500 to-purple-600"
        >
          <Progress
            value={data.storage_percent}
            className="h-2"
          />
        </KpiCard>
      </motion.div>
    </motion.div>
  );
}

function getTrend(percent: number): 'up' | 'down' | 'neutral' {
  if (percent > 0) return 'up';
  if (percent < 0) return 'down';
  return 'neutral';
}
