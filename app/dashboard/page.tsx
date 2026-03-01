'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  ArrowLeft,
  FileText,
  CheckCircle,
  Clock,
  Trash2,
  Link2,
  Shield,
  Plus,
  Upload,
  FolderPlus,
  UserPlus,
} from 'lucide-react';
import { formatFileSize, formatRelativeDate } from '@/lib/utils/format';
import { DashboardCharts } from '@/components/dashboard/charts';
import { KpiGrid } from '@/components/dashboard/KpiGrid';
import { SmartAlerts } from '@/components/dashboard/SmartAlerts';
import { RevenueTrendChart } from '@/components/dashboard/RevenueTrendChart';
import { ProjectPipelineChart } from '@/components/dashboard/ProjectPipelineChart';
import { ClientDistributionChart } from '@/components/dashboard/ClientDistributionChart';
import { TeamWorkloadChart } from '@/components/dashboard/TeamWorkloadChart';

interface DashboardData {
  total_files: number;
  total_users: number;
  total_clients: number;
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  total_teams: number;
  total_quotes: number;
  signed_quotes: number;
  pending_approvals: number;
  trash_count: number;
  active_shares: number;
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
  max_storage_gb?: number;
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
  // Finance actions
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
  // Portal actions
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

/* ── Clickable stat card ─────────────────────────── */
function StatCard({ href, title, value, subtitle, icon: Icon, accent }: {
  href: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="transition-colors group-hover:border-orange-500/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={`h-4 w-4 transition-colors ${accent || 'text-muted-foreground group-hover:text-orange-500'}`} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono">{value}</div>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── Mini stat row ─────────────────────────── */
function MiniStat({ label, value, icon: Icon, accent }: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent || 'bg-muted/50'}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <span className="font-bold font-mono text-sm">{value}</span>
    </div>
  );
}

/* ── Storage bar ─────────────────────────── */
function StorageBar({ used, maxGb = 50 }: { used: number; maxGb?: number }) {
  const usedGB = used / (1024 * 1024 * 1024);
  const percent = Math.min((usedGB / maxGb) * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">مساحة التخزين</span>
        <span className="font-mono font-medium">{formatFileSize(used)} / {maxGb} GB</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            percent > 80 ? 'bg-red-500' : percent > 50 ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: `${Math.max(percent, 1)}%` }}
        />
      </div>
    </div>
  );
}

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
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const isAdmin = !!(data && 'total_users' in data);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="text-muted-foreground">
            نظرة عامة على Pyra Workspace
          </p>
        </div>
      </div>

      {/* ═══ KPI Section (Admin) ═══ */}
      {isAdmin && (
        <>
          <SmartAlerts />
          <KpiGrid />
        </>
      )}

      {/* ═══ Primary Stats Grid ═══ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          href="/dashboard/files"
          title="الملفات"
          value={data?.total_files ?? data?.accessible_files ?? 0}
          subtitle={isAdmin ? 'إجمالي الملفات في النظام' : 'ملفات متاحة لك'}
          icon={FolderOpen}
        />

        {isAdmin && data && (
          <StatCard
            href="/dashboard/projects"
            title="المشاريع"
            value={data.total_projects ?? 0}
            subtitle={`${data.active_projects ?? 0} نشط · ${data.completed_projects ?? 0} مكتمل`}
            icon={Briefcase}
          />
        )}

        {isAdmin && data && (
          <StatCard
            href="/dashboard/clients"
            title="العملاء"
            value={data.total_clients ?? 0}
            subtitle="عميل مسجل"
            icon={Building2}
          />
        )}

        {isAdmin && data && (
          <StatCard
            href="/dashboard/users"
            title="المستخدمون"
            value={data.total_users ?? 0}
            subtitle={`${data.total_teams ?? 0} فريق`}
            icon={Users}
          />
        )}

        <StatCard
          href="/dashboard/notifications"
          title="الإشعارات"
          value={data?.unread_notifications ?? 0}
          subtitle="غير مقروءة"
          icon={Bell}
          accent={data?.unread_notifications ? 'text-orange-500' : undefined}
        />

        {isAdmin && data && (
          <StatCard
            href="/dashboard/quotes"
            title="عروض الأسعار"
            value={data.total_quotes ?? 0}
            subtitle={`${data.signed_quotes ?? 0} موقّعة`}
            icon={FileText}
          />
        )}

        {isAdmin && data && (
          <StatCard
            href="/dashboard/projects"
            title="الموافقات المعلقة"
            value={data.pending_approvals ?? 0}
            subtitle="بانتظار الموافقة"
            icon={Clock}
            accent={(data.pending_approvals ?? 0) > 0 ? 'text-yellow-500' : undefined}
          />
        )}

        {isAdmin && data && (
          <StatCard
            href="/dashboard/files"
            title="التخزين"
            value={formatFileSize(data.storage_used ?? 0)}
            subtitle="مساحة مستخدمة"
            icon={HardDrive}
          />
        )}
      </div>

      {/* ═══ Charts Section (Admin) ═══ */}
      {isAdmin && <DashboardCharts />}

      {/* ═══ KPI Charts (Admin) ═══ */}
      {isAdmin && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RevenueTrendChart />
            <ProjectPipelineChart />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ClientDistributionChart />
            <TeamWorkloadChart />
          </div>
        </>
      )}

      {/* ═══ Two-column: Activity + Sidebar ═══ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              آخر النشاطات
            </CardTitle>
            <Link href="/dashboard/activity" className="text-xs text-orange-600 hover:underline flex items-center gap-1">
              عرض الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
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

        {/* Sidebar: Storage + Quick Stats + Quick Actions */}
        <div className="space-y-4">
          {/* Storage Card */}
          {isAdmin && data && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <HardDrive className="h-4 w-4" /> التخزين
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StorageBar used={data.storage_used ?? 0} maxGb={data.max_storage_gb ?? 50} />
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          {isAdmin && data && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">إحصائيات سريعة</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                <MiniStat
                  label="روابط مشاركة نشطة"
                  value={data.active_shares ?? 0}
                  icon={Link2}
                  accent="bg-blue-100 dark:bg-blue-900/30"
                />
                <MiniStat
                  label="سلة المحذوفات"
                  value={data.trash_count ?? 0}
                  icon={Trash2}
                  accent="bg-red-100 dark:bg-red-900/30"
                />
                <MiniStat
                  label="موافقات معلقة"
                  value={data.pending_approvals ?? 0}
                  icon={Shield}
                  accent="bg-yellow-100 dark:bg-yellow-900/30"
                />
                <MiniStat
                  label="عروض موقّعة"
                  value={data.signed_quotes ?? 0}
                  icon={CheckCircle}
                  accent="bg-green-100 dark:bg-green-900/30"
                />
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات سريعة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/dashboard/files" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <Upload className="h-4 w-4 me-2" /> رفع ملفات
                </Button>
              </Link>
              <Link href="/dashboard/files" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start">
                  <FolderPlus className="h-4 w-4 me-2" /> مجلد جديد
                </Button>
              </Link>
              {isAdmin && (
                <>
                  <Link href="/dashboard/projects" className="block">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <Plus className="h-4 w-4 me-2" /> مشروع جديد
                    </Button>
                  </Link>
                  <Link href="/dashboard/clients" className="block">
                    <Button variant="outline" size="sm" className="w-full justify-start">
                      <UserPlus className="h-4 w-4 me-2" /> عميل جديد
                    </Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
