'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate, formatDate } from '@/lib/utils/format';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderKanban,
  Clock,
  Bell,
  FolderOpen,
  ChevronLeft,
  FileCheck,
  Eye,
  CheckCircle,
  FileText,
  Share2,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Activity,
  TrendingUp,
  LogIn,
  Download,
  FileSearch,
  PenLine,
  ArrowLeftRight,
} from 'lucide-react';

// ---------- Types ----------

interface DashboardStats {
  activeProjects: number;
  pendingApprovals: number;
  unreadNotifications: number;
  totalFiles: number;
}

interface DashboardProject {
  id: string;
  name: string;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  updated_at: string;
}

interface DashboardNotification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface ActivityEntry {
  id: string;
  action_type: string;
  display_name: string | null;
  target_path: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ChartDataPoint {
  day: string;
  count: number;
}

interface ProjectProgressItem {
  id: string;
  name: string;
  totalFiles: number;
  approvedFiles: number;
  progress: number;
}

interface DashboardData {
  client: {
    name: string;
    company: string;
    last_login_at: string | null;
  };
  stats: DashboardStats;
  recentProjects: DashboardProject[];
  recentNotifications: DashboardNotification[];
  recentActivity: ActivityEntry[];
  chartData: ChartDataPoint[];
  projectProgress: ProjectProgressItem[];
}

// ---------- Helpers ----------

const actionTypeLabels: Record<string, string> = {
  portal_login: 'تسجيل دخول',
  file_preview: 'معاينة ملف',
  file_download: 'تحميل ملف',
  quote_viewed: 'عرض سعر',
  quote_signed: 'توقيع عرض سعر',
  file_approved: 'موافقة على ملف',
  file_rejected: 'رفض ملف',
  comment_added: 'إضافة تعليق',
  page_view: 'عرض صفحة',
  notification_read: 'قراءة إشعار',
};

function getActionLabel(actionType: string): string {
  return actionTypeLabels[actionType] || actionType;
}

function getActionIcon(actionType: string) {
  switch (actionType) {
    case 'portal_login':
      return LogIn;
    case 'file_preview':
      return Eye;
    case 'file_download':
      return Download;
    case 'quote_viewed':
      return FileSearch;
    case 'quote_signed':
      return PenLine;
    case 'file_approved':
      return CheckCircle;
    case 'file_rejected':
      return ArrowLeftRight;
    case 'comment_added':
      return FileText;
    default:
      return Activity;
  }
}

function getActionColor(actionType: string): string {
  switch (actionType) {
    case 'portal_login':
      return 'bg-blue-500';
    case 'file_preview':
      return 'bg-purple-500';
    case 'file_download':
      return 'bg-green-500';
    case 'quote_viewed':
      return 'bg-amber-500';
    case 'quote_signed':
      return 'bg-orange-500';
    case 'file_approved':
      return 'bg-emerald-500';
    case 'file_rejected':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function getNotificationIcon(type: string) {
  switch (type) {
    case 'file_shared':
      return Share2;
    case 'review_request':
      return Eye;
    case 'review_response':
      return CheckCircle;
    case 'new_quote':
      return FileText;
    case 'file_approved':
      return FileCheck;
    default:
      return Bell;
  }
}

// ---------- Animated Counter ----------

function AnimatedCounter({ target, duration = 1000 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }

    let startTime: number | null = null;
    let animationFrame: number;

    function animate(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    }

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration]);

  return <>{count}</>;
}

// ---------- Custom Tooltip ----------

function CustomChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        {payload[0].value} {payload[0].value === 1 ? 'نشاط' : 'أنشطة'}
      </p>
    </div>
  );
}

// ---------- Stagger Animation Variants ----------

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

// ---------- Component ----------

export default function PortalDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch('/api/portal/dashboard');
        const json = await res.json();
        if (res.ok && json.data) {
          setData(json.data);
        }
      } catch {
        // silently fail -- skeleton remains
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/portal/notifications/${id}`, { method: 'PATCH' });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          recentNotifications: prev.recentNotifications.map((n) =>
            n.id === id ? { ...n, is_read: true } : n
          ),
          stats: {
            ...prev.stats,
            unreadNotifications: Math.max(0, prev.stats.unreadNotifications - 1),
          },
        };
      });
    } catch {
      // ignore
    }
  }, []);

  // ---------- Loading skeleton ----------

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Welcome Banner Skeleton */}
        <Skeleton className="h-32 w-full rounded-xl" />

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>

        {/* Quick Actions Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        {/* Charts Row Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>

        {/* Bottom Row Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  // ---------- Data ----------

  const stats = data?.stats ?? {
    activeProjects: 0,
    pendingApprovals: 0,
    unreadNotifications: 0,
    totalFiles: 0,
  };

  const statCards = [
    {
      label: 'المشاريع النشطة',
      value: stats.activeProjects,
      icon: FolderKanban,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      iconBg: 'bg-blue-500/15',
    },
    {
      label: 'بانتظار الموافقة',
      value: stats.pendingApprovals,
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      iconBg: 'bg-amber-500/15',
    },
    {
      label: 'إشعارات غير مقروءة',
      value: stats.unreadNotifications,
      icon: Bell,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      iconBg: 'bg-orange-500/15',
    },
    {
      label: 'إجمالي الملفات',
      value: stats.totalFiles,
      icon: FolderOpen,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      iconBg: 'bg-green-500/15',
    },
  ];

  const quickActions = [
    {
      label: 'تصفح الملفات',
      href: '/portal/files',
      icon: FolderOpen,
    },
    {
      label: 'عروض الأسعار',
      href: '/portal/quotes',
      icon: Receipt,
    },
    {
      label: 'المشاريع',
      href: '/portal/projects',
      icon: FolderKanban,
    },
    {
      label: 'السكريبتات',
      href: '/portal/scripts',
      icon: ScrollText,
    },
  ];

  // ---------- Render ----------

  return (
    <motion.div
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* ── Welcome Banner ──────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <Card className="overflow-hidden border-orange-500/20">
          <div className="relative bg-gradient-to-l from-orange-500/10 via-orange-400/5 to-transparent">
            {/* Decorative circles */}
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-orange-500/5 blur-2xl" />
            <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-orange-400/5 blur-2xl" />
            <CardContent className="relative flex items-center gap-4 py-8 px-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                <LayoutDashboard className="h-7 w-7 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold truncate">
                  مرحبا، {data?.client.name ?? 'العميل'}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {data?.client.company}
                  {data?.client.last_login_at && (
                    <span className="mx-2">
                      &middot; آخر دخول{' '}
                      {formatDate(data.client.last_login_at, 'dd MMM yyyy')}
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </div>
        </Card>
      </motion.div>

      {/* ── Stats Grid ──────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        variants={containerVariants}
      >
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.label} variants={itemVariants}>
              <Card className="group hover:shadow-md hover:border-orange-500/20 transition-all duration-300 cursor-default">
                <CardContent className="flex items-center gap-4 py-5">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110',
                      item.iconBg
                    )}
                  >
                    <Icon className={cn('h-5 w-5', item.color)} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-3xl font-bold tabular-nums">
                      <AnimatedCounter target={item.value} />
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {item.label}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Quick Actions ──────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.href}
                onClick={() => router.push(action.href)}
                className="flex flex-col items-center justify-center gap-2.5 rounded-xl border bg-card p-5 hover:shadow-md hover:border-orange-300 dark:hover:border-orange-500/40 transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
                  <Icon className="h-5 w-5 text-orange-500" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ── Charts Row: Weekly Activity + Project Progress ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity Chart */}
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-orange-500" />
                النشاط الأسبوعي
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.chartData && data.chartData.some((d) => d.count > 0) ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                      />
                      <Tooltip
                        content={<CustomChartTooltip />}
                        cursor={{ fill: 'hsl(var(--muted))', radius: 4 }}
                      />
                      <Bar
                        dataKey="count"
                        fill="#f97316"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">لا يوجد نشاط هذا الأسبوع</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Project Progress */}
        <motion.div variants={itemVariants}>
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                تقدم المشاريع
              </CardTitle>
              <button
                onClick={() => router.push('/portal/projects')}
                className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 transition-colors"
              >
                عرض الكل
                <ChevronLeft className="h-3 w-3" />
              </button>
            </CardHeader>
            <CardContent>
              {data?.projectProgress && data.projectProgress.length > 0 ? (
                <div className="space-y-5">
                  {data.projectProgress.map((project) => (
                    <div key={project.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate max-w-[60%]">
                          {project.name}
                        </p>
                        <Badge
                          variant="outline"
                          className="text-xs tabular-nums shrink-0"
                        >
                          {project.progress}%
                        </Badge>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-l from-orange-500 to-orange-400"
                          initial={{ width: 0 }}
                          animate={{ width: `${project.progress}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {project.approvedFiles} من {project.totalFiles} ملف مكتمل
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">لا توجد بيانات تقدم</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ── Bottom Row: Recent Activity + Recent Notifications ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity Timeline */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-orange-500" />
                آخر النشاطات
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.recentActivity && data.recentActivity.length > 0 ? (
                <div className="relative space-y-0">
                  {/* Vertical timeline line */}
                  <div className="absolute top-2 bottom-2 right-[11px] w-px bg-border" />

                  {data.recentActivity.map((entry, index) => {
                    const ActionIcon = getActionIcon(entry.action_type);
                    const dotColor = getActionColor(entry.action_type);
                    return (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05, duration: 0.3 }}
                        className="relative flex items-start gap-3 py-3"
                      >
                        {/* Timeline dot */}
                        <div
                          className={cn(
                            'relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                            dotColor
                          )}
                        >
                          <ActionIcon className="h-3 w-3 text-white" />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-sm font-medium">
                            {getActionLabel(entry.action_type)}
                          </p>
                          {entry.display_name && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {entry.display_name}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatRelativeDate(entry.created_at)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  لا توجد نشاطات حديثة
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Notifications */}
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-orange-500" />
                آخر الإشعارات
              </CardTitle>
              <button
                onClick={() => router.push('/portal/notifications')}
                className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 transition-colors"
              >
                عرض الكل
                <ChevronLeft className="h-3 w-3" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!data?.recentNotifications || data.recentNotifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  لا توجد إشعارات
                </p>
              ) : (
                data.recentNotifications.map((notif) => {
                  const NotifIcon = getNotificationIcon(notif.type);
                  return (
                    <button
                      key={notif.id}
                      onClick={() => !notif.is_read && markNotificationRead(notif.id)}
                      className={cn(
                        'w-full flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-all duration-200 text-start',
                        !notif.is_read &&
                          'bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10'
                      )}
                    >
                      <div
                        className={cn(
                          'w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                          notif.is_read
                            ? 'bg-muted'
                            : 'bg-orange-500/10'
                        )}
                      >
                        <NotifIcon
                          className={cn(
                            'h-4 w-4',
                            notif.is_read
                              ? 'text-muted-foreground'
                              : 'text-orange-500'
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed">{notif.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeDate(notif.created_at)}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-2 animate-pulse" />
                      )}
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
