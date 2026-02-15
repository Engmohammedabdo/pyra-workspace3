'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';
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

interface DashboardData {
  client: {
    name: string;
    company: string;
    last_login_at: string | null;
  };
  stats: DashboardStats;
  recentProjects: DashboardProject[];
  recentNotifications: DashboardNotification[];
}

// ---------- Helpers ----------

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: 'نشط',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  in_progress: {
    label: 'قيد التنفيذ',
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
  review: {
    label: 'قيد المراجعة',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  },
  completed: {
    label: 'مكتمل',
    className: 'bg-green-500/10 text-green-600 border-green-500/20',
  },
  archived: {
    label: 'مؤرشف',
    className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  },
};

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
        // silently fail — skeleton remains
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  async function markNotificationRead(id: string) {
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
  }

  // ---------- Loading skeleton ----------

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  // ---------- Render ----------

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
    },
    {
      label: 'بانتظار الموافقة',
      value: stats.pendingApprovals,
      icon: Clock,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: 'إشعارات غير مقروءة',
      value: stats.unreadNotifications,
      icon: Bell,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      label: 'إجمالي الملفات',
      value: stats.totalFiles,
      icon: FolderOpen,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Card */}
      <Card className="border-orange-500/20 bg-gradient-to-l from-orange-500/5 to-transparent">
        <CardContent className="flex items-center gap-4 py-6">
          <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <LayoutDashboard className="h-6 w-6 text-orange-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">
              مرحباً، {data?.client.name ?? 'العميل'}
            </h1>
            <p className="text-sm text-muted-foreground">
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
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label}>
              <CardContent className="flex items-center gap-4 py-5">
                <div
                  className={cn(
                    'w-11 h-11 rounded-lg flex items-center justify-center shrink-0',
                    item.bg
                  )}
                >
                  <Icon className={cn('h-5 w-5', item.color)} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold">{item.value}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.label}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Projects + Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Projects */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">آخر المشاريع</CardTitle>
            <button
              onClick={() => router.push('/portal/projects')}
              className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 transition-colors"
            >
              عرض الكل
              <ChevronLeft className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(!data?.recentProjects || data.recentProjects.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                لا توجد مشاريع حتى الآن
              </p>
            ) : (
              data.recentProjects.map((project) => {
                const status = statusConfig[project.status] ?? statusConfig.active;
                return (
                  <button
                    key={project.id}
                    onClick={() => router.push(`/portal/projects/${project.id}`)}
                    className="w-full flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors text-start"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        آخر تحديث {formatRelativeDate(project.updated_at)}
                      </p>
                    </div>
                    <Badge className={cn('shrink-0', status.className)}>
                      {status.label}
                    </Badge>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Recent Notifications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">آخر الإشعارات</CardTitle>
            <button
              onClick={() => router.push('/portal/notifications')}
              className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 transition-colors"
            >
              عرض الكل
              <ChevronLeft className="h-3 w-3" />
            </button>
          </CardHeader>
          <CardContent className="space-y-3">
            {(!data?.recentNotifications || data.recentNotifications.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-6">
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
                      'w-full flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors text-start',
                      !notif.is_read && 'bg-orange-500/5 border-orange-500/20'
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <NotifIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed">{notif.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatRelativeDate(notif.created_at)}
                      </p>
                    </div>
                    {!notif.is_read && (
                      <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0 mt-2" />
                    )}
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
