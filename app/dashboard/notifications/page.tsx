'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, CheckCheck, Mail, MailOpen } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';

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
  team_added: 'فريق',
  permission_changed: 'صلاحيات',
  file_shared: 'مشاركة',
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'unread') params.set('unread_only', 'true');
      const res = await fetch(`/api/notifications?${params}`);
      const json = await res.json();
      if (json.data) setNotifications(json.data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) { console.error(err); }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> الإشعارات
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
              <div className="p-12 text-center text-muted-foreground">لا توجد إشعارات</div>
            ) : notifications.map(n => (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-4 border-b cursor-pointer transition-colors hover:bg-muted/30 ${!n.is_read ? 'bg-orange-500/5' : ''}`}
                onClick={() => !n.is_read && markRead(n.id)}
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
                  </div>
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
