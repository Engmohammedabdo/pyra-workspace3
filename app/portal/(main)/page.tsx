'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { FolderKanban, Clock, Bell, FolderOpen, Receipt, ScrollText } from 'lucide-react';
import { WelcomeBanner } from '@/components/portal/home/welcome-banner';
import { StatsGrid } from '@/components/portal/home/stats-grid';
import { QuickActions } from '@/components/portal/home/quick-actions';
import { FinancialSummary } from '@/components/portal/home/financial-summary';
import { WeeklyActivityChart } from '@/components/portal/home/weekly-activity-chart';
import { ProjectProgress } from '@/components/portal/home/project-progress';
import { RecentActivity } from '@/components/portal/home/recent-activity';
import { RecentNotifications } from '@/components/portal/home/recent-notifications';
import { Skeleton } from '@/components/ui/skeleton';

export default function PortalDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/dashboard');
      const json = await res.json();
      if (res.ok && json.data) setData(json.data);
    } catch {
      toast.error('فشل في تحميل لوحة المعلومات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/portal/notifications/${id}`, { method: 'PATCH' });
      setData((prev: any) => ({
        ...prev,
        recentNotifications: prev.recentNotifications.map((n: any) => n.id === id ? { ...n, is_read: true } : n),
        stats: { ...prev.stats, unreadNotifications: Math.max(0, prev.stats.unreadNotifications - 1) },
      }));
    } catch {}
  }, []);

  if (loading) return <div className="space-y-6">
    <Skeleton className="h-32 w-full rounded-xl" />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
  </div>;

  const stats = data?.stats ?? { activeProjects: 0, pendingApprovals: 0, unreadNotifications: 0, totalFiles: 0 };
  const statCards = [
    { label: 'المشاريع النشطة', value: stats.activeProjects, icon: FolderKanban, color: 'text-blue-500', bg: 'bg-blue-500/10', iconBg: 'bg-blue-500/15' },
    { label: 'بانتظار الموافقة', value: stats.pendingApprovals, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', iconBg: 'bg-amber-500/15' },
    { label: 'إشعارات غير مقروءة', value: stats.unreadNotifications, icon: Bell, color: 'text-portal', bg: 'bg-portal/10', iconBg: 'bg-portal/15' },
    { label: 'إجمالي الملفات', value: stats.totalFiles, icon: FolderOpen, color: 'text-green-500', bg: 'bg-green-500/10', iconBg: 'bg-green-500/15' },
  ];

  const quickActions = [
    { label: 'تصفح الملفات', href: '/portal/files', icon: FolderOpen },
    { label: 'عروض الأسعار', href: '/portal/quotes', icon: Receipt },
    { label: 'المشاريع', href: '/portal/projects', icon: FolderKanban },
    { label: 'السكريبتات', href: '/portal/scripts', icon: ScrollText },
  ];

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <WelcomeBanner client={data?.client} onRefresh={fetchDashboard} loading={loading} />
      <StatsGrid stats={statCards} />
      {data?.financialSummary && data.financialSummary.invoiceCount > 0 && <FinancialSummary financial={data.financialSummary} />}
      <QuickActions actions={quickActions} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyActivityChart data={data?.chartData} />
        <ProjectProgress projects={data?.projectProgress} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity activity={data?.recentActivity} />
        <RecentNotifications notifications={data?.recentNotifications} onMarkRead={markNotificationRead} />
      </div>
    </motion.div>
  );
}
