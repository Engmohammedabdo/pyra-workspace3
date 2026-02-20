'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Activity, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react';
import { formatRelativeDate, formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';

interface ActivityItem {
  id: string;
  action_type: string;
  username: string;
  display_name: string;
  target_path: string;
  details: Record<string, unknown> | null;
  ip_address: string;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  // Admin / system actions
  file_uploaded: 'رفع ملف', file_deleted: 'حذف ملف', file_renamed: 'إعادة تسمية',
  file_moved: 'نقل ملف', folder_created: 'إنشاء مجلد', user_created: 'إنشاء مستخدم',
  user_updated: 'تحديث مستخدم', user_deleted: 'حذف مستخدم', team_created: 'إنشاء فريق',
  client_created: 'إنشاء عميل', project_created: 'إنشاء مشروع', share_created: 'رابط مشاركة',
  review_added: 'مراجعة', settings_updated: 'تحديث إعدادات', file_restored: 'استعادة ملف',
  file_purged: 'حذف نهائي', login: 'تسجيل دخول', logout: 'تسجيل خروج',
  password_changed: 'تغيير كلمة مرور',
  // Portal client actions
  portal_login: 'دخول عميل', portal_logout: 'خروج عميل',
  portal_download: 'تحميل ملف (عميل)', portal_preview: 'معاينة ملف (عميل)',
  file_approved: 'اعتماد ملف', revision_requested: 'طلب تعديل',
  client_comment: 'تعليق عميل', quote_signed: 'توقيع عرض سعر',
  quote_viewed: 'مشاهدة عرض سعر',
  script_approved: 'اعتماد سكريبت', script_revision_requested: 'طلب تعديل سكريبت',
  portal_password_changed: 'تغيير كلمة مرور (عميل)',
  portal_password_reset_requested: 'طلب استعادة كلمة مرور',
  portal_password_reset_completed: 'إعادة تعيين كلمة مرور',
  portal_profile_updated: 'تحديث بروفايل عميل',
};

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const pageSize = 20;

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('action_type', typeFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      params.set('page', String(page));
      params.set('limit', String(pageSize));
      const res = await fetch(`/api/activity?${params}`);
      const json = await res.json();
      if (json.data) setItems(json.data);
      if (json.meta?.total) setTotal(json.meta.total);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [typeFilter, page, dateFrom, dateTo]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('format', 'csv');
      if (typeFilter !== 'all') params.set('action_type', typeFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);

      const res = await fetch(`/api/activity/export?${params}`);
      if (!res.ok) {
        throw new Error('Export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('تم تصدير سجل النشاط بنجاح');
    } catch {
      toast.error('فشل في تصدير سجل النشاط');
    } finally {
      setExporting(false);
    }
  }, [typeFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> سجل النشاط</h1>
          <p className="text-muted-foreground">جميع الإجراءات والعمليات في النظام</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          disabled={exporting}
          className="gap-2"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          تصدير CSV
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="نوع النشاط" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الأنواع</SelectItem>
            <SelectItem value="file_uploaded">رفع ملف</SelectItem>
            <SelectItem value="file_deleted">حذف ملف</SelectItem>
            <SelectItem value="file_renamed">إعادة تسمية</SelectItem>
            <SelectItem value="folder_created">إنشاء مجلد</SelectItem>
            <SelectItem value="user_created">إنشاء مستخدم</SelectItem>
            <SelectItem value="user_deleted">حذف مستخدم</SelectItem>
            <SelectItem value="team_created">فريق</SelectItem>
            <SelectItem value="settings_updated">إعدادات</SelectItem>
            <SelectItem value="_divider" disabled>── أنشطة العملاء ──</SelectItem>
            <SelectItem value="portal_login">دخول عميل</SelectItem>
            <SelectItem value="portal_logout">خروج عميل</SelectItem>
            <SelectItem value="portal_download">تحميل ملف (عميل)</SelectItem>
            <SelectItem value="portal_preview">معاينة ملف (عميل)</SelectItem>
            <SelectItem value="file_approved">اعتماد ملف</SelectItem>
            <SelectItem value="revision_requested">طلب تعديل</SelectItem>
            <SelectItem value="client_comment">تعليق عميل</SelectItem>
            <SelectItem value="quote_viewed">مشاهدة عرض سعر</SelectItem>
            <SelectItem value="quote_signed">توقيع عرض سعر</SelectItem>
            <SelectItem value="script_approved">اعتماد سكريبت</SelectItem>
            <SelectItem value="script_revision_requested">طلب تعديل سكريبت</SelectItem>
            <SelectItem value="portal_password_changed">تغيير كلمة مرور (عميل)</SelectItem>
            <SelectItem value="portal_profile_updated">تحديث بروفايل عميل</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="w-[150px] h-9 text-xs"
          />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="w-[150px] h-9 text-xs"
          />
        </div>

        <span className="text-sm text-muted-foreground">{total} نتيجة</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            {loading ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="p-4 border-b"><Skeleton className="h-12 w-full" /></div>
            )) : items.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">لا توجد نشاطات</div>
            ) : items.map(item => (
              <div key={item.id} className="flex items-start gap-3 p-4 border-b">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 mt-0.5">
                  <Activity className="h-4 w-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.display_name}</span>
                    <Badge variant="secondary" className="text-[10px]">{ACTION_LABELS[item.action_type] || item.action_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{item.target_path}</p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>@{item.username}</span><span>·</span>
                    <span>{formatRelativeDate(item.created_at)}</span><span>·</span>
                    <span>{formatDate(item.created_at, 'dd-MM-yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">صفحة {page} من {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
