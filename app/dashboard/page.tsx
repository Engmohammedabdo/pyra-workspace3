'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FolderOpen,
  Bell,
  Activity,
  ArrowLeft,
  FileText,
  Clock,
  Plus,
  Upload,
  UserPlus,
  RefreshCw,
  CheckSquare,
  AlertTriangle,
  Megaphone,
  CalendarDays,
  Kanban,
  Sparkles,
  Receipt,
  ArrowUpRight,
  Zap,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { DashboardCharts } from '@/components/dashboard/charts';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { SmartAlerts } from '@/components/dashboard/SmartAlerts';
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart';
import { ProjectPipelineChart } from '@/components/dashboard/ProjectPipelineChart';
import { ClientDistributionChart } from '@/components/dashboard/ClientDistributionChart';
import { TeamWorkloadChart } from '@/components/dashboard/TeamWorkloadChart';
import { motion } from 'framer-motion';

interface DashboardData {
  // Admin fields (only present for admin role)
  total_files?: number;
  total_users?: number;
  total_clients?: number;
  total_projects?: number;
  active_projects?: number;
  completed_projects?: number;
  total_teams?: number;
  total_quotes?: number;
  signed_quotes?: number;
  pending_approvals?: number;
  trash_count?: number;
  active_shares?: number;
  storage_used?: number;
  max_storage_gb?: number;
  // Shared fields
  recent_activity: Array<{
    id: string;
    action_type: string;
    username: string;
    display_name: string;
    target_path: string;
    created_at: string;
  }>;
  unread_notifications: number;
  // Employee fields
  accessible_files?: number;
  permitted_paths?: string[];
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

const ACTION_LABELS: Record<string, string> = {
  file_uploaded: 'رفع ملف',
  file_deleted: 'حذف ملف',
  file_renamed: 'إعادة تسمية',
  file_moved: 'نقل ملف',
  folder_created: 'إنشاء مجلد',
  user_created: 'إنشاء مستخدم',
  user_updated: 'تحديث مستخدم',
  user_deleted: 'حذف مستخدم',
  team_created: 'إنشاء فريق',
  client_created: 'إنشاء عميل',
  project_created: 'إنشاء مشروع',
  project_deleted: 'حذف مشروع',
  share_created: 'إنشاء رابط مشاركة',
  review_added: 'إضافة مراجعة',
  settings_updated: 'تحديث الإعدادات',
  file_restored: 'استعادة ملف',
  file_purged: 'حذف نهائي',
  upload: 'رفع ملف',
  upload_deletion: 'حذف ملف مرفوع',
  version_restore: 'استعادة نسخة',
  version_delete: 'حذف نسخة',
  trash_empty: 'تفريغ السلة',
  trash_purge: 'حذف منتهية',
  password_changed: 'تغيير كلمة مرور',
  create_expense: 'إنشاء مصروف',
  update_expense: 'تحديث مصروف',
  delete_expense: 'حذف مصروف',
  create_subscription: 'إنشاء اشتراك',
  update_subscription: 'تحديث اشتراك',
  delete_subscription: 'حذف اشتراك',
  create_card: 'إضافة بطاقة',
  update_card: 'تحديث بطاقة',
  delete_card: 'حذف بطاقة',
  create_contract: 'إنشاء عقد',
  update_contract: 'تحديث عقد',
  create_target: 'إنشاء هدف',
  update_target: 'تحديث هدف',
  payment_recorded: 'تسجيل دفعة',
  invoice_sent: 'إرسال فاتورة',
  invoice_created: 'إنشاء فاتورة',
  milestone_invoice_generated: 'فاتورة مرحلة',
  quote_sent: 'إرسال عرض سعر',
  quote_signed: 'توقيع عرض سعر',
  quote_viewed: 'مشاهدة عرض سعر',
  portal_login: 'دخول عميل',
  portal_logout: 'خروج عميل',
  portal_download: 'تحميل ملف (عميل)',
  portal_preview: 'معاينة ملف (عميل)',
  file_approved: 'اعتماد ملف',
  revision_requested: 'طلب تعديل',
  client_comment: 'تعليق عميل',
  script_approved: 'اعتماد سكريبت',
  script_revision_requested: 'طلب تعديل سكريبت',
  script_reply_sent: 'رد إدارة على سكريبت',
  script_client_reply: 'رد عميل على سكريبت',
  login: 'تسجيل دخول',
  logout: 'تسجيل خروج',
};

const ACTION_COLORS: Record<string, string> = {
  file_uploaded: 'from-blue-400 to-blue-600',
  upload: 'from-blue-400 to-blue-600',
  file_deleted: 'from-red-400 to-red-600',
  file_purged: 'from-red-400 to-red-600',
  project_created: 'from-emerald-400 to-emerald-600',
  client_created: 'from-violet-400 to-violet-600',
  invoice_created: 'from-orange-400 to-amber-600',
  invoice_sent: 'from-orange-400 to-amber-600',
  payment_recorded: 'from-emerald-400 to-teal-600',
  quote_sent: 'from-indigo-400 to-indigo-600',
  quote_signed: 'from-emerald-400 to-emerald-600',
  login: 'from-gray-400 to-gray-600',
  logout: 'from-gray-400 to-gray-600',
};

const containerMotion = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemMotion = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

/* ── Clickable stat card ─────────────────────────── */
function StatCard({ href, title, value, subtitle, icon: Icon, accent, gradient }: {
  href: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  gradient?: string;
}) {
  const gradientClass = gradient || 'from-orange-500 to-amber-600';

  return (
    <Link href={href} className="group block">
      <motion.div
        whileHover={{ y: -3, scale: 1.01 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5',
          'shadow-sm hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20',
          'transition-shadow duration-300',
          accent && 'border-s-[3px]',
        )}
        style={accent ? { borderInlineStartColor: accent } : undefined}
      >
        {/* Gradient orb */}
        <div className={cn(
          'absolute -top-8 -end-8 w-24 h-24 rounded-full opacity-[0.07] blur-2xl',
          `bg-gradient-to-br ${gradientClass}`,
        )} />

        <div className="relative flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground/80 font-medium">{title}</p>
            <p className="text-2xl font-bold tracking-tight mt-1">{value}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{subtitle}</p>
          </div>
          <div className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0',
            'bg-gradient-to-br shadow-lg',
            gradientClass,
          )}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

/* ── Quick action item ─────────────────────────── */
function QuickAction({ href, icon: Icon, label, gradient }: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  gradient: string;
}) {
  return (
    <Link href={href} className="group block">
      <div className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl',
        'border border-border/40 bg-card/50',
        'hover:bg-card hover:border-border/80 hover:shadow-sm',
        'transition-all duration-200',
      )}>
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
          'bg-gradient-to-br shadow-sm',
          gradient,
        )}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium flex-1">{label}</span>
        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground/60 transition-colors" />
      </div>
    </Link>
  );
}

/* ── Leave balance mini stat ─────────────────────────── */
function LeaveBar({ label, value, gradient, maxValue = 30 }: {
  label: string;
  value: number;
  gradient: string;
  maxValue?: number;
}) {
  const percent = Math.min((value / maxValue) * 100, 100);
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-muted-foreground/70">{label}</span>
        <span className="text-sm font-bold">{value} <span className="text-[10px] font-normal text-muted-foreground/50">يوم</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
          className={cn('h-full rounded-full bg-gradient-to-r', gradient)}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(res => {
        if (res.data) setData(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const isAdmin = !!(data && 'total_users' in data);

  const today = new Date().toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <motion.div
      variants={containerMotion}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* ═══ Zone 1: Welcome Hero ═══ */}
      <motion.div variants={itemMotion}>
        <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent p-6">
          {/* Decorative shapes */}
          <div className="absolute end-0 top-0 w-64 h-64 rounded-full bg-gradient-to-br from-orange-400/10 to-amber-500/5 -translate-y-1/2 translate-x-1/3 blur-3xl" />
          <div className="absolute start-1/2 bottom-0 w-40 h-40 rounded-full bg-gradient-to-br from-orange-500/5 to-transparent translate-y-1/2 blur-2xl" />
          <div className="absolute end-12 bottom-2 w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-400/8 to-amber-500/4 rotate-12" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-xl shadow-orange-500/20">
                <Sparkles className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">مرحباً بك في Pyra Workspace</h1>
                <p className="text-sm text-muted-foreground/70 mt-0.5">{today}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl hover:bg-orange-500/10"
              onClick={loadDashboard}
              aria-label="تحديث البيانات"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </motion.div>

      {isAdmin && (
        <motion.div variants={itemMotion}>
          <SmartAlerts />
        </motion.div>
      )}

      {/* ═══ Zone 2: KPI Grid (Admin) ═══ */}
      {isAdmin && (
        <motion.div variants={itemMotion}>
          <KpiGrid />
        </motion.div>
      )}

      {/* ═══ Zone 2b: Employee Stats Grid ═══ */}
      {!isAdmin && data && (
        <motion.div
          variants={containerMotion}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <motion.div variants={itemMotion}>
            <StatCard
              href="/dashboard/files"
              title="الملفات"
              value={data.accessible_files ?? 0}
              subtitle="ملفات متاحة لك"
              icon={FolderOpen}
              gradient="from-blue-500 to-indigo-600"
            />
          </motion.div>
          <motion.div variants={itemMotion}>
            <StatCard
              href="/dashboard/my-tasks"
              title="مهامي"
              value={data.my_tasks_count ?? 0}
              subtitle={
                (data.my_tasks_overdue ?? 0) > 0
                  ? `${data.my_tasks_overdue} متأخرة`
                  : 'لا توجد مهام متأخرة'
              }
              icon={CheckSquare}
              accent={(data.my_tasks_overdue ?? 0) > 0 ? '#ef4444' : undefined}
              gradient={(data.my_tasks_overdue ?? 0) > 0 ? 'from-red-500 to-rose-600' : 'from-emerald-500 to-teal-600'}
            />
          </motion.div>
          <motion.div variants={itemMotion}>
            <StatCard
              href="/dashboard/timesheet"
              title="ساعات هذا الأسبوع"
              value={data.my_hours_this_week ?? 0}
              subtitle="ساعة مسجلة"
              icon={Clock}
              gradient="from-violet-500 to-purple-600"
            />
          </motion.div>
          <motion.div variants={itemMotion}>
            <StatCard
              href="/dashboard/notifications"
              title="الإشعارات"
              value={data.unread_notifications ?? 0}
              subtitle="غير مقروءة"
              icon={Bell}
              accent={data.unread_notifications ? '#f97316' : undefined}
              gradient="from-orange-500 to-amber-600"
            />
          </motion.div>
        </motion.div>
      )}

      {/* ═══ Employee Overdue Alert ═══ */}
      {!isAdmin && data && (data.my_tasks_overdue ?? 0) > 0 && (
        <motion.div variants={itemMotion}>
          <Link href="/dashboard/my-tasks" className="block group">
            <div className="relative overflow-hidden rounded-2xl border border-red-300/50 dark:border-red-800/50 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-950/10 p-4 hover:shadow-lg hover:shadow-red-500/10 transition-all duration-200">
              <div className="absolute -end-4 -top-4 w-24 h-24 rounded-full bg-red-400/10 blur-2xl" />
              <div className="relative flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
                  <AlertTriangle className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-red-800 dark:text-red-300">
                    لديك {data.my_tasks_overdue} مهام متأخرة
                  </p>
                  <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-0.5">
                    يرجى مراجعة المهام المتأخرة واتخاذ الإجراء المناسب
                  </p>
                </div>
                <ArrowLeft className="h-5 w-5 text-red-400 group-hover:translate-x-[-4px] transition-transform" />
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* ═══ Zone 3: Charts (Admin) ═══ */}
      {isAdmin && (
        <>
          <motion.div variants={itemMotion}>
            <RevenueTrendChart />
          </motion.div>

          <motion.div variants={itemMotion}>
            <div className="grid gap-4 lg:grid-cols-3">
              <ProjectPipelineChart />
              <ClientDistributionChart />
              <TeamWorkloadChart />
            </div>
          </motion.div>

          <motion.div variants={itemMotion}>
            <DashboardCharts />
          </motion.div>
        </>
      )}

      {/* ═══ Zone 4: Two-column — Activity + Quick Actions ═══ */}
      <motion.div variants={itemMotion}>
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Recent Activity */}
          <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
                  <Activity className="h-4 w-4 text-white" />
                </div>
                <h2 className="font-bold text-sm">آخر النشاطات</h2>
              </div>
              <Link href="/dashboard/activity" className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 flex items-center gap-1 font-medium">
                عرض الكل <ArrowLeft className="h-3 w-3" />
              </Link>
            </div>
            <ScrollArea className="h-[360px]">
              {data?.recent_activity && data.recent_activity.length > 0 ? (
                <div className="p-4 space-y-2">
                  {data.recent_activity.map((activity, idx) => {
                    const gradientColor = ACTION_COLORS[activity.action_type] || 'from-gray-400 to-gray-600';
                    return (
                      <motion.div
                        key={activity.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.3, ease: 'easeOut' }}
                        className="flex items-start gap-3 rounded-xl border border-border/30 bg-card/50 p-3 hover:bg-muted/30 transition-colors duration-150"
                      >
                        <div className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm',
                          gradientColor,
                        )}>
                          <Activity className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">
                              {activity.display_name}
                            </span>
                            <Badge variant="secondary" className="text-[10px] px-2 py-0 rounded-full bg-muted/60">
                              {ACTION_LABELS[activity.action_type] || activity.action_type}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
                            {activity.target_path}
                          </p>
                          <p className="text-[10px] text-muted-foreground/40 mt-1">
                            {formatRelativeDate(activity.created_at)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground/40">
                  <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                    <Activity className="h-7 w-7 opacity-40" />
                  </div>
                  <p className="text-sm font-medium">لا توجد نشاطات حديثة</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Quick Actions + Leave Summary */}
          <div className="space-y-4">
            {/* Quick Actions */}
            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/15">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <h2 className="font-bold text-sm">إجراءات سريعة</h2>
              </div>
              <div className="p-3 space-y-1.5">
                {isAdmin ? (
                  <>
                    <QuickAction href="/dashboard/invoices/new" icon={Receipt} label="فاتورة جديدة" gradient="from-orange-500 to-amber-600" />
                    <QuickAction href="/dashboard/quotes/new" icon={FileText} label="عرض سعر جديد" gradient="from-indigo-500 to-blue-600" />
                    <QuickAction href="/dashboard/projects?action=new" icon={Plus} label="مشروع جديد" gradient="from-emerald-500 to-teal-600" />
                    <QuickAction href="/dashboard/clients?action=new" icon={UserPlus} label="عميل جديد" gradient="from-violet-500 to-purple-600" />
                    <QuickAction href="/dashboard/files" icon={Upload} label="رفع ملفات" gradient="from-blue-500 to-cyan-600" />
                  </>
                ) : (
                  <>
                    <QuickAction href="/dashboard/my-tasks" icon={CheckSquare} label="مهامي" gradient="from-emerald-500 to-teal-600" />
                    <QuickAction href="/dashboard/boards" icon={Kanban} label="لوحات العمل" gradient="from-blue-500 to-indigo-600" />
                    <QuickAction href="/dashboard/timesheet" icon={Clock} label="تسجيل ساعات" gradient="from-violet-500 to-purple-600" />
                    <QuickAction href="/dashboard/files" icon={Upload} label="رفع ملفات" gradient="from-orange-500 to-amber-600" />
                  </>
                )}
              </div>
            </div>

            {/* Employee: Leave Summary */}
            {!isAdmin && data?.leave_balance && (
              <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
                    <CalendarDays className="h-4 w-4 text-white" />
                  </div>
                  <h2 className="font-bold text-sm">رصيد الإجازات</h2>
                </div>
                <div className="px-5 py-3 space-y-1 divide-y divide-border/30">
                  <LeaveBar
                    label="سنوية"
                    value={data.leave_balance.annual_remaining}
                    gradient="from-orange-400 to-amber-500"
                  />
                  <LeaveBar
                    label="مرضية"
                    value={data.leave_balance.sick_remaining}
                    gradient="from-blue-400 to-indigo-500"
                    maxValue={15}
                  />
                  <LeaveBar
                    label="شخصية"
                    value={data.leave_balance.personal_remaining}
                    gradient="from-violet-400 to-purple-500"
                    maxValue={10}
                  />
                </div>
                {(data.pending_leave_count ?? 0) > 0 && (
                  <div className="px-5 py-3 border-t border-border/30">
                    <Link href="/dashboard/leave" className="block">
                      <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-full px-3">
                        {data.pending_leave_count} طلب معلق
                      </Badge>
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Employee: Announcements */}
            {!isAdmin && data && (data.unread_announcements ?? 0) > 0 && (
              <Link href="/dashboard/announcements" className="block group">
                <div className="relative overflow-hidden rounded-2xl border border-blue-300/40 dark:border-blue-800/40 bg-gradient-to-br from-blue-50/80 to-blue-100/30 dark:from-blue-950/30 dark:to-blue-950/10 p-4 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200">
                  <div className="absolute -end-4 -top-4 w-20 h-20 rounded-full bg-blue-400/10 blur-2xl" />
                  <div className="relative flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-md shadow-blue-500/15">
                      <Megaphone className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{data.unread_announcements} إعلانات جديدة</p>
                      <p className="text-[10px] text-muted-foreground/60">اضغط لقراءة الإعلانات</p>
                    </div>
                    <ArrowLeft className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-[-4px] transition-transform" />
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
