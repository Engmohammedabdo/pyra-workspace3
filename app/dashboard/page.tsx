'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FolderOpen,
  Users,
  Building2,
  Briefcase,
  Bell,
  HardDrive,
  Activity,
} from 'lucide-react';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';

interface DashboardData {
  total_files: number;
  total_users: number;
  total_clients: number;
  total_projects: number;
  recent_activity: Array<{
    id: string;
    action_type: string;
    username: string;
    display_name: string;
    target_path: string;
    created_at: string;
  }>;
  unread_notifications: number;
  storage_used: number;
  // Employee fields
  accessible_files?: number;
  permitted_paths?: string[];
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
  share_created: 'إنشاء رابط مشاركة',
  review_added: 'إضافة مراجعة',
  settings_updated: 'تحديث الإعدادات',
  file_restored: 'استعادة ملف',
  file_purged: 'حذف نهائي',
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(res => {
        if (res.data) setData(res.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const isAdmin = !!(data && 'total_users' in data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="text-muted-foreground">
          نظرة عامة على Pyra Workspace
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الملفات</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {data?.total_files ?? data?.accessible_files ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? 'إجمالي الملفات' : 'ملفات متاحة'}
            </p>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المستخدمون</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{data.total_users}</div>
              <p className="text-xs text-muted-foreground">مستخدم مسجل</p>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">العملاء</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{data.total_clients}</div>
              <p className="text-xs text-muted-foreground">عميل مسجل</p>
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">المشاريع</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{data.total_projects}</div>
              <p className="text-xs text-muted-foreground">مشروع</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الإشعارات</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {data?.unread_notifications ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">غير مقروءة</p>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">التخزين</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatFileSize(data.storage_used)}
              </div>
              <p className="text-xs text-muted-foreground">مساحة مستخدمة</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            آخر النشاطات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            {data?.recent_activity && data.recent_activity.length > 0 ? (
              <div className="space-y-3">
                {data.recent_activity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
                      <Activity className="h-4 w-4 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {activity.display_name}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {ACTION_LABELS[activity.action_type] || activity.action_type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {activity.target_path}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatRelativeDate(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                لا توجد نشاطات حديثة
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
