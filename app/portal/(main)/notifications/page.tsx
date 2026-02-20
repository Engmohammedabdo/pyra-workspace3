'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bell,
  Eye,
  CheckCircle,
  FileText,
  FileCheck,
  Share2,
  MessageSquare,
  FolderKanban,
  CheckCheck,
  Loader2,
  ScrollText,
} from 'lucide-react';

// ---------- Types ----------

interface ClientNotification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

// ---------- Helpers ----------

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
    case 'new_comment':
      return MessageSquare;
    case 'project_update':
      return FolderKanban;
    case 'script_reply':
      return ScrollText;
    default:
      return Bell;
  }
}

function getNotificationIconColor(type: string) {
  switch (type) {
    case 'file_shared':
      return 'text-blue-500 bg-blue-500/10';
    case 'review_request':
      return 'text-amber-500 bg-amber-500/10';
    case 'review_response':
      return 'text-green-500 bg-green-500/10';
    case 'new_quote':
      return 'text-purple-500 bg-purple-500/10';
    case 'file_approved':
      return 'text-green-500 bg-green-500/10';
    case 'new_comment':
      return 'text-blue-500 bg-blue-500/10';
    case 'project_update':
      return 'text-orange-500 bg-orange-500/10';
    case 'script_reply':
      return 'text-indigo-500 bg-indigo-500/10';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

// ---------- Component ----------

export default function PortalNotificationsPage() {
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [markAllLoading, setMarkAllLoading] = useState(false);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch('/api/portal/notifications');
        const json = await res.json();
        if (res.ok && json.data) {
          setNotifications(json.data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchNotifications();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.is_read);
    }
    return notifications;
  }, [notifications, filter]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  // ---------- Actions ----------

  async function markAsRead(id: string) {
    try {
      const res = await fetch(`/api/portal/notifications/${id}`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
      }
    } catch {
      // ignore
    }
  }

  async function markAllAsRead() {
    setMarkAllLoading(true);
    try {
      const res = await fetch('/api/portal/notifications', {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, is_read: true }))
        );
        toast.success('تم تحديد جميع الإشعارات كمقروءة');
      } else {
        toast.error('حدث خطأ أثناء تحديث الإشعارات');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setMarkAllLoading(false);
    }
  }

  // ---------- Loading ----------

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ---------- Render ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">الإشعارات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          تابع جميع التحديثات والإشعارات المتعلقة بمشاريعك
        </p>
      </div>

      {/* Filters + Mark All */}
      <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">الكل</TabsTrigger>
            <TabsTrigger value="unread">
              غير مقروء
              {unreadCount > 0 && (
                <span className="ms-1.5 text-[10px] bg-orange-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllAsRead}
            disabled={markAllLoading}
            className="gap-2"
          >
            {markAllLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            تحديد الكل كمقروء
          </Button>
        )}
      </div>

      {/* Notifications List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
              <Bell className="h-7 w-7 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">لا توجد إشعارات</h2>
            <p className="text-muted-foreground text-sm max-w-md">
              {filter === 'unread'
                ? 'لا توجد إشعارات غير مقروءة حالياً'
                : 'لا توجد إشعارات حتى الآن'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((notif) => {
            const NotifIcon = getNotificationIcon(notif.type);
            const iconColor = getNotificationIconColor(notif.type);

            return (
              <Card
                key={notif.id}
                className={cn(
                  'cursor-pointer transition-all hover:shadow-sm',
                  !notif.is_read && 'bg-orange-500/5 border-orange-500/20'
                )}
                onClick={() => !notif.is_read && markAsRead(notif.id)}
              >
                <CardContent className="flex items-start gap-4 py-4">
                  {/* Icon */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                      iconColor
                    )}
                  >
                    <NotifIcon className="h-5 w-5" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm leading-relaxed',
                        !notif.is_read && 'font-medium'
                      )}
                    >
                      {notif.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatRelativeDate(notif.created_at)}
                    </p>
                  </div>

                  {/* Unread indicator */}
                  {!notif.is_read && (
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0 mt-2" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
