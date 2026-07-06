'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';
import { useHROverview } from '@/hooks/useHROverview';
import { HrAlerts } from '@/components/hr/overview/HrAlerts';
import { HrKpiRow } from '@/components/hr/overview/HrKpiRow';
import { HeadcountChart } from '@/components/hr/overview/HeadcountChart';
import { PayrollTrendChart } from '@/components/hr/overview/PayrollTrendChart';
import { UpcomingLeaveList } from '@/components/hr/overview/UpcomingLeaveList';
import { EvaluationsStatusCard } from '@/components/hr/overview/EvaluationsStatusCard';
import { CelebrationsCard } from '@/components/hr/overview/CelebrationsCard';
import { LeaveLiabilityCard } from '@/components/hr/overview/LeaveLiabilityCard';

const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemMotion = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export default function HrOverviewClient() {
  const t = useTranslations('hr.overview.loadError');
  const { data, isLoading } = useHROverview();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={Users}
        title={t('title')}
        description={t('description')}
      />
    );
  }

  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-6">
      {/* Alerts banner — self-hides when alerts array is empty */}
      <motion.div variants={itemMotion}>
        <HrAlerts alerts={data.alerts} />
      </motion.div>

      {/* KPI row — 5 cards */}
      <motion.div variants={itemMotion}>
        <HrKpiRow data={data} />
      </motion.div>

      {/* Charts row — 2 columns on lg+ */}
      <motion.div variants={itemMotion} className="grid gap-4 lg:grid-cols-2">
        <HeadcountChart byDepartment={data.headcount.by_department} />
        <PayrollTrendChart trendByCurrency={data.payroll.trend_by_currency} />
      </motion.div>

      {/* Bottom row — 4 columns on lg+ */}
      <motion.div variants={itemMotion} className="grid gap-4 lg:grid-cols-4">
        <UpcomingLeaveList items={data.leave.upcoming} />
        <EvaluationsStatusCard evaluations={data.evaluations} />
        <CelebrationsCard items={data.celebrations} />
        <LeaveLiabilityCard liabilityByCurrency={data.leave.liability_by_currency} />
      </motion.div>
    </motion.div>
  );
}
