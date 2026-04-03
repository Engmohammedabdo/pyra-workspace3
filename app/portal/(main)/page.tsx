'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { usePortalDashboard } from '@/hooks/usePortalDashboard';
import { mutateAPI } from '@/hooks/api-helpers';

export default function PortalDashboardPage() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading, refetch } = usePortalDashboard();

  const fetchDashboard = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await mutateAPI(`/api/portal/notifications/${id}`, 'PATCH');
      queryClient.setQueryData(['portal', 'dashboard'], (prev: typeof data) => {
        if (!prev) return prev;
        return {
          ...prev,
          recentNotifications: prev.recentNotifications?.map((n) =>
            n.id === id ? { ...n, is_read: true } : n
          ),
          stats: prev.stats
            ? { ...prev.stats, unreadNotifications: Math.max(0, prev.stats.unreadNotifications - 1) }
            : prev.stats,
        };
      });
    } catch {
      // ignore
    }
  }, [queryClient]);

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

  type DashboardClient = { name: string; company: string; last_login_at: string | null };
  type FinancialData = { totalInvoiced: number; totalPaid: number; totalRemaining: number; invoiceCount: number; pendingCount: number };
  type ChartData = { day: string; count: number }[];
  type ProjectData = { id: string; name: string; status?: string; totalFiles: number; approvedFiles: number; progress: number }[];
  type ActivityEntry = { id: string; action_type: string; display_name: string | null; created_at: string }[];
  type NotifData = { id: string; type: string; message: string; is_read: boolean; created_at: string }[];

  const clientData = data?.client as DashboardClient | undefined;
  const financialData = data?.financialSummary as FinancialData | undefined;
  const chartData = data?.chartData as ChartData | undefined;
  const projectData = data?.projectProgress as ProjectData | undefined;
  const activityData = data?.recentActivity as ActivityEntry | undefined;
  const notifData = data?.recentNotifications as NotifData | undefined;

  return (
    <motion.div className="space-y-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {clientData && <WelcomeBanner client={clientData} onRefresh={fetchDashboard} loading={loading} />}
      <StatsGrid stats={statCards} />
      {financialData && financialData.invoiceCount > 0 && <FinancialSummary financial={financialData} />}
      <QuickActions actions={quickActions} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WeeklyActivityChart data={chartData ?? []} />
        <ProjectProgress projects={projectData ?? []} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity activity={activityData ?? []} />
        <RecentNotifications notifications={notifData ?? []} onMarkRead={markNotificationRead} />
      </div>
    </motion.div>
  );
}
