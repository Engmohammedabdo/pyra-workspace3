'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/hooks/useNotifications';
import { useRealtime } from '@/hooks/useRealtime';
import { formatRelativeDate } from '@/lib/utils/format';

/** Resolve legacy target_path (raw project ID) to a dashboard route */
function resolveTargetLink(type: string, targetPath: string): string | null {
  if (!targetPath) return null;
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
  return '/dashboard/notifications';
}

interface NotificationBellProps {
  username: string;
}

export function NotificationBell({ username }: NotificationBellProps) {
  const router = useRouter();
  const { notifications, unreadCount, loading, refresh, markRead, markAllRead } =
    useNotifications();

  // Subscribe to realtime for instant updates
  const handleNewNotification = useCallback(() => {
    refresh();
  }, [refresh]);

  useRealtime({ username, onNewNotification: handleNewNotification });

  const handleNotificationClick = (notification: { id: string; type: string; target_path: string; is_read: boolean }) => {
    if (!notification.is_read) {
      markRead(notification.id);
    }
    if (notification.target_path) {
      // If target_path already starts with /dashboard, use it directly
      if (notification.target_path.startsWith('/dashboard')) {
        router.push(notification.target_path);
      } else {
        // Legacy: target_path is a raw project ID — resolve it
        const resolved = resolveTargetLink(notification.type, notification.target_path);
        if (resolved) router.push(resolved);
      }
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="الإشعارات">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="text-sm font-semibold">الإشعارات</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground"
              onClick={markAllRead}
            >
              <CheckCheck className="me-1 h-3 w-3" />
              تعليم الكل كمقروء
            </Button>
          )}
        </div>

        {/* Notification List */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              جاري التحميل...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              لا توجد إشعارات
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className="flex w-full items-start gap-3 border-b p-3 text-start transition-colors hover:bg-muted/50 last:border-b-0"
              >
                {/* Read indicator */}
                <div className="mt-1.5 flex-shrink-0">
                  {n.is_read ? (
                    <Check className="h-3 w-3 text-muted-foreground/50" />
                  ) : (
                    <span className="block h-2 w-2 rounded-full bg-orange-500" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{n.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {n.message}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{n.source_display_name}</span>
                    <span>·</span>
                    <span>{formatRelativeDate(n.created_at)}</span>
                  </div>
                </div>

                {/* Link indicator */}
                {n.target_path && (
                  <ExternalLink className="mt-1.5 h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => router.push('/dashboard/notifications')}
          >
            عرض كل الإشعارات
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
