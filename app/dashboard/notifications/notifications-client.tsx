'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, CheckCheck, Mail, MailOpen, ExternalLink } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  source_display_name: string;
  target_path: string;
  is_read: boolean;
  created_at: string;
}

const NOTIF_TYPES: Record<string, string> = {
  file_uploaded: 'رفع ملف',
  comment_added: 'تعليق',
  approval_requested: 'طلب موافقة',
  review_added: 'مراجعة',
  review: 'مراجعة',
  team_added: 'فريق',
  permission_changed: 'صلاحيات',
  file_shared: 'مشاركة',
  mention: 'إشارة',
  client_comment: 'تعليق عميل',
  script_client_reply: 'رد عميل',
  script_reply_sent: 'رد إدارة',
  script_approved: 'اعتماد سكريبت',
  script_revision_requested: 'طلب تعديل',
  invoice_sent: 'إرسال فاتورة',
  invoice_created: 'إنشاء فاتورة',
  payment_recorded: 'تسجيل دفعة',
  milestone_invoice_generated: 'فاتورة مرحلة',
  quote_signed: 'توقيع عرض',
  quote_viewed: 'مشاهدة عرض',
  quote_sent: 'إرسال عرض',
  file_approved: 'اعتماد ملف',
  revision_requested: 'طلب تعديل',
};

/** Resolve a notification target_path to a dashboard route */
function resolveTargetLink(type: string, targetPath: string): string | null {
  if (!targetPath) return null;
  // If target_path already starts with /dashboard, use it directly (new format)
  if (targetPath.startsWith('/dashboard')) return targetPath;
  // Legacy: target_path is a raw ID — resolve based on type
  if (type === 'mention' || type === 'client_comment' || type === 'comment_added') {
    return `/dashboard/projects/${targetPath}`;
  }
  if (type === 'file_uploaded' || type === 'file_shared') {
    return '/dashboard/files';
  }
  if (type === 'review_added' || type === 'approval_requested') {
    return '/dashboard/reviews';
  }
  if (type === 'team_added') {
    return '/dashboard/teams';
  }
  if (type === 'permission_changed') {
    return '/dashboard/permissions';
  }
  return null;
}

export default function NotificationsClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data: notifications = [], isLoading: loading } = useQuery<Notification[]>({
    queryKey: ['notifications', filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter === 'unread') params.set('unread_only', 'true');
      return fetchAPI(`/api/notifications?${params}`);
    },
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/notifications/${id}`, 'PATCH'),
    onError: (err) => console.error(err),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => mutateAPI('/api/notifications/read-all', 'POST'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    onError: (err) => console.error(err),
  });

  const markRead = async (id: string) => {
    await markReadMutation.mutateAsync(id);
    queryClient.setQueryData<Notification[]>(['notifications', filter], prev =>
      (prev || []).map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  };

  const markAllRead = () => markAllReadMutation.mutate();

  const handleClick = async (n: Notification) => {
    // Mark as read
    if (!n.is_read) await markRead(n.id);
    // Navigate to target
    const link = resolveTargetLink(n.type, n.target_path);
    if (link) router.push(link);
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" aria-hidden="true" /> الإشعارات
            {unreadCount > 0 && <Badge variant="destructive" className="text-xs">{unreadCount}</Badge>}
          </h1>
          <p className="text-muted-foreground">جميع الإشعارات والتنبيهات</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllRead}><CheckCheck className="h-4 w-4 me-2" /> تحديد الكل كمقروء</Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>الكل</Button>
        <Button variant={filter === 'unread' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('unread')}>غير مقروء</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 border-b"><Skeleton className="h-12 w-full" /></div>
            )) : notifications.length === 0 ? (
              <EmptyState icon={Bell} title="لا توجد إشعارات" description="ستظهر هنا الإشعارات والتنبيهات الجديدة" />
            ) : notifications.map(n => {
              const targetLink = resolveTargetLink(n.type, n.target_path);
              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-4 border-b cursor-pointer transition-colors hover:bg-muted/30 ${!n.is_read ? 'bg-orange-500/5' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  <div className="mt-1">
                    {n.is_read ? <MailOpen className="h-5 w-5 text-muted-foreground" /> : <Mail className="h-5 w-5 text-orange-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{n.title || n.message}</span>
                      <Badge variant="secondary" className="text-[10px]">{NOTIF_TYPES[n.type] || n.type}</Badge>
                      {!n.is_read && <div className="h-2 w-2 rounded-full bg-orange-500" />}
                    </div>
                    {n.title && n.message !== n.title && <p className="text-xs text-muted-foreground mt-1 truncate">{n.message}</p>}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{n.source_display_name}</span>
                      <span>·</span>
                      <span>{formatRelativeDate(n.created_at)}</span>
                      {targetLink && (
                        <>
                          <span>·</span>
                          <span className="text-orange-600 dark:text-orange-400 flex items-center gap-0.5">
                            <ExternalLink className="h-2.5 w-2.5" /> فتح
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
