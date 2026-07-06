'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations, useLocale } from 'next-intl';
import { fetchAPI } from '@/hooks/api-helpers';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FolderOpen,
  Bell,
  Activity,
  ArrowLeft,
  CheckSquare,
  AlertTriangle,
  Megaphone,
  CalendarDays,
  Kanban,
  Sparkles,
  Receipt,
  Plus,
  UserPlus,
  Upload,
  Clock,
  Zap,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { DashboardCharts } from '@/components/dashboard/charts';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { SmartAlerts } from '@/components/dashboard/SmartAlerts';
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart';
import { ProjectPipelineChart } from '@/components/dashboard/ProjectPipelineChart';
import { ClientDistributionChart } from '@/components/dashboard/ClientDistributionChart';
import { TeamWorkloadChart } from '@/components/dashboard/TeamWorkloadChart';
import { motion } from 'framer-motion';

import { WelcomeHero } from '@/components/dashboard/home/WelcomeHero';
import { StatCard } from '@/components/dashboard/home/StatCard';
import { QuickAction } from '@/components/dashboard/home/QuickAction';
import { LeaveBar } from '@/components/dashboard/home/LeaveBar';
import { MyWorkInbox } from '@/components/dashboard/MyWorkInbox';
import { MyCalendarWidget } from '@/components/dashboard/MyCalendarWidget';
import { EmployeeQuickPanel } from '@/components/dashboard/EmployeeQuickPanel';

interface DashboardData {
  total_files?: number;
  total_users?: number;
  total_clients?: number;
  total_projects?: number;
  active_projects?: number;
  completed_projects?: number;
  total_teams?: number;
  total_quotes?: number;
  recent_activity: Array<{
    id: string;
    action_type: string;
    username: string;
    display_name: string;
    target_path: string;
    created_at: string;
  }>;
  unread_notifications: number;
  accessible_files?: number;
  my_tasks_count?: number;
  my_tasks_overdue?: number;
  my_hours_this_week?: number;
  unread_announcements?: number;
  leave_balance?: {
    annual_remaining: number;
    sick_remaining: number;
    personal_remaining: number;
  };
  pending_leave_count?: number;
}

const ACTION_COLORS: Record<string, string> = {
  file_uploaded: 'from-blue-400 to-blue-600', upload: 'from-blue-400 to-blue-600',
  file_deleted: 'from-red-400 to-red-600', file_purged: 'from-red-400 to-red-600',
  project_created: 'from-emerald-400 to-emerald-600', client_created: 'from-violet-400 to-violet-600',
  invoice_created: 'from-orange-400 to-amber-600', invoice_sent: 'from-orange-400 to-amber-600',
  payment_recorded: 'from-emerald-400 to-teal-600', quote_sent: 'from-indigo-400 to-indigo-600',
  quote_signed: 'from-emerald-400 to-emerald-600', login: 'from-gray-400 to-gray-600',
  logout: 'from-gray-400 to-gray-600',
};

const containerMotion = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const itemMotion = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export default function DashboardPage() {
  const { data, isLoading: loading, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => fetchAPI('/api/dashboard'),
    staleTime: 60_000,
  });

  const t = useTranslations('finance.dashboardHome');
  const tActivity = useTranslations('finance.activityLabels');
  const tNavItems = useTranslations('nav.items');
  const tPaletteActions = useTranslations('nav.palette.actions');
  const tMyWork = useTranslations('mywork.inbox');
  const leaveTypeLabel = useStatusLabels('leaveType');
  const locale = useLocale();

  const actionLabelFor = (actionType: string): string =>
    tActivity.has(actionType as Parameters<typeof tActivity>[0])
      ? tActivity(actionType as Parameters<typeof tActivity>[0])
      : actionType;

  const loadDashboard = () => { refetch(); };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const isAdmin = !!(data && 'total_users' in data);
  const today = new Date().toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <motion.div variants={containerMotion} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={itemMotion}><WelcomeHero today={today} onRefresh={loadDashboard} loading={loading} /></motion.div>

      {/* Phase 15.1 Commit 6 — My Work inbox + Calendar widget paired in a
          2-col grid on lg+ screens (stack on mobile per LOCK 2). MyWorkInbox
          surfaces tasks/approvals/conversations; MyCalendarWidget surfaces
          today/overdue/upcoming events from the unified calendar feed.
          Both shown for ALL roles. MyCalendarWidget self-hides for users
          without calendar.view permission. */}
      <motion.div variants={itemMotion} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <MyWorkInbox />
        <MyCalendarWidget />
      </motion.div>

      {!isAdmin && <motion.div variants={itemMotion}><EmployeeQuickPanel /></motion.div>}

      {isAdmin && <motion.div variants={itemMotion}><SmartAlerts /></motion.div>}
      {isAdmin && <motion.div variants={itemMotion}><KpiGrid /></motion.div>}
      {!isAdmin && data && (
        <motion.div variants={containerMotion} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div variants={itemMotion}><StatCard href="/dashboard/files" title={tNavItems('files')} value={data.accessible_files ?? 0} subtitle={t('statCards.filesSubtitle')} icon={FolderOpen} gradient="from-blue-500 to-indigo-600" /></motion.div>
          <motion.div variants={itemMotion}><StatCard href="/dashboard/my-tasks" title={tNavItems('myTasks')} value={data.my_tasks_count ?? 0} subtitle={(data.my_tasks_overdue ?? 0) > 0 ? t('statCards.overdueCount', { count: data.my_tasks_overdue ?? 0 }) : t('statCards.noOverdueTasks')} icon={CheckSquare} accent={(data.my_tasks_overdue ?? 0) > 0 ? '#ef4444' : undefined} gradient={(data.my_tasks_overdue ?? 0) > 0 ? 'from-red-500 to-rose-600' : 'from-emerald-500 to-teal-600'} /></motion.div>
          <motion.div variants={itemMotion}><StatCard href="/dashboard/timesheet" title={t('statCards.hoursThisWeek')} value={data.my_hours_this_week ?? 0} subtitle={t('statCards.hoursSubtitle')} icon={Clock} gradient="from-violet-500 to-purple-600" /></motion.div>
          <motion.div variants={itemMotion}><StatCard href="/dashboard/notifications" title={tNavItems('notifications')} value={data.unread_notifications ?? 0} subtitle={t('statCards.unreadSubtitle')} icon={Bell} accent={data.unread_notifications ? '#f97316' : undefined} gradient="from-orange-500 to-amber-600" /></motion.div>
        </motion.div>
      )}
      {!isAdmin && data && (data.my_tasks_overdue ?? 0) > 0 && (
        <motion.div variants={itemMotion}>
          <Link href="/dashboard/my-tasks" className="block group">
            <div className="relative overflow-hidden rounded-2xl border border-red-300/50 dark:border-red-800/50 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-950/10 p-4 hover:shadow-lg hover:shadow-red-500/10 transition-all duration-200">
              <div className="relative flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20"><AlertTriangle className="h-6 w-6 text-white" /></div>
                <div className="flex-1">
                  <p className="font-semibold text-red-800 dark:text-red-300">{t('overdueBanner.title', { count: data.my_tasks_overdue ?? 0 })}</p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">{t('overdueBanner.subtitle')}</p>
                </div>
                <ArrowLeft className="h-5 w-5 text-red-400 group-hover:translate-x-[-4px] transition-transform" />
              </div>
            </div>
          </Link>
        </motion.div>
      )}
      {isAdmin && (
        <>
          <motion.div variants={itemMotion}><RevenueTrendChart /></motion.div>
          <motion.div variants={itemMotion}><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><ProjectPipelineChart /><ClientDistributionChart /><TeamWorkloadChart /></div></motion.div>
          <motion.div variants={itemMotion}><DashboardCharts /></motion.div>
        </>
      )}
      <motion.div variants={itemMotion}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15"><Activity className="h-4 w-4 text-white" /></div><h2 className="font-bold text-sm">{t('recentActivity.title')}</h2></div>
              <Link href="/dashboard/activity" className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 flex items-center gap-1 font-medium">{tMyWork('viewAll')} <ArrowLeft className="h-3 w-3" /></Link>
            </div>
            <ScrollArea className="h-[360px]">
              {data?.recent_activity && data.recent_activity.length > 0 ? (
                <div className="p-4 space-y-2">
                  {data.recent_activity.map((a, i) => (
                    <motion.div key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="flex items-start gap-3 rounded-xl border border-border/30 bg-card/50 p-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br', ACTION_COLORS[a.action_type] || 'from-gray-400 to-gray-600')}><Activity className="h-4 w-4 text-white" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm">{a.display_name}</span><Badge variant="secondary" className="text-[10px] px-2 py-0 rounded-full">{actionLabelFor(a.action_type)}</Badge></div>
                        <p className="text-xs text-muted-foreground/60 truncate mt-0.5">{a.target_path}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">{formatRelativeDate(a.created_at, locale)}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : <EmptyState icon={Activity} title={t('recentActivity.empty')} className="py-8" />}
            </ScrollArea>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"><div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center"><Zap className="h-4 w-4 text-white" /></div><h2 className="font-bold text-sm">{t('quickActions.title')}</h2></div>
              <div className="p-3 space-y-1.5">
                {isAdmin ? (
                  <>
                    <QuickAction href="/dashboard/invoices/new" icon={Receipt} label={tPaletteActions('newInvoice')} gradient="from-orange-500 to-amber-600" />
                    <QuickAction href="/dashboard/quotes/new" icon={Sparkles} label={tPaletteActions('newQuote')} gradient="from-indigo-500 to-blue-600" />
                    <QuickAction href="/dashboard/projects?action=new" icon={Plus} label={tPaletteActions('newProject')} gradient="from-emerald-500 to-teal-600" />
                    <QuickAction href="/dashboard/clients?action=new" icon={UserPlus} label={tPaletteActions('newClient')} gradient="from-violet-500 to-purple-600" />
                    <QuickAction href="/dashboard/files" icon={Upload} label={t('quickActions.uploadFiles')} gradient="from-blue-500 to-cyan-600" />
                  </>
                ) : (
                  <>
                    <QuickAction href="/dashboard/my-tasks" icon={CheckSquare} label={tNavItems('myTasks')} gradient="from-emerald-500 to-teal-600" />
                    <QuickAction href="/dashboard/boards" icon={Kanban} label={tNavItems('boards')} gradient="from-blue-500 to-indigo-600" />
                    <QuickAction href="/dashboard/timesheet" icon={Clock} label={t('quickActions.logHours')} gradient="from-violet-500 to-purple-600" />
                    <QuickAction href="/dashboard/files" icon={Upload} label={t('quickActions.uploadFiles')} gradient="from-orange-500 to-amber-600" />
                  </>
                )}
              </div>
            </div>
            {!isAdmin && data?.leave_balance && (
              <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40"><div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-white" /></div><h2 className="font-bold text-sm">{t('leaveBalance.title')}</h2></div>
                <div className="px-5 py-3 space-y-1 divide-y divide-border/30">
                  <LeaveBar label={leaveTypeLabel('annual')} value={data.leave_balance.annual_remaining} gradient="from-orange-400 to-amber-500" />
                  <LeaveBar label={leaveTypeLabel('sick')} value={data.leave_balance.sick_remaining} gradient="from-blue-400 to-indigo-500" maxValue={15} />
                  <LeaveBar label={leaveTypeLabel('personal')} value={data.leave_balance.personal_remaining} gradient="from-violet-400 to-purple-500" maxValue={10} />
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
