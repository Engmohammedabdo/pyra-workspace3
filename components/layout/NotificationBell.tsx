'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bell,
  CheckCheck,
  Volume2,
  VolumeX,
  Eye,
  CheckCircle2,
  PencilLine,
  AlarmClock,
  CheckSquare,
  Clock,
  Briefcase,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications, requestNotificationPermission } from '@/hooks/useNotifications';
import { useRealtime } from '@/hooks/useRealtime';
import { formatRelativeDate, dubaiDayKey } from '@/lib/utils/format';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from '@/lib/utils/notification-sound';

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

/** Per-type icon + color chip, resolved via prefix matching so 40+ types collapse to ~8 groups */
function typeVisual(type: string): { icon: LucideIcon; classes: string } {
  if (type.startsWith('task_submitted') || type === 'file_approval_requested') {
    return { icon: Eye, classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  }
  if (type.startsWith('task_approved')) {
    return { icon: CheckCircle2, classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  }
  if (type.startsWith('task_revision_requested')) {
    return { icon: PencilLine, classes: 'bg-red-500/10 text-red-600 dark:text-red-400' };
  }
  if (type.startsWith('task_overdue') || type.startsWith('task_due_soon')) {
    return { icon: AlarmClock, classes: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' };
  }
  if (type.startsWith('task')) {
    return { icon: CheckSquare, classes: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' };
  }
  if (type.startsWith('attendance')) {
    return { icon: Clock, classes: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' };
  }
  if (
    type.startsWith('leave') ||
    type.startsWith('expense') ||
    type.startsWith('timesheet') ||
    type.startsWith('payroll') ||
    type.startsWith('evaluation') ||
    type.startsWith('document')
  ) {
    return { icon: Briefcase, classes: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' };
  }
  if (
    type.startsWith('lead') ||
    type.startsWith('whatsapp') ||
    type.startsWith('follow_up') ||
    type.startsWith('quote')
  ) {
    return { icon: MessageSquare, classes: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' };
  }
  return { icon: Bell, classes: 'bg-muted text-muted-foreground' };
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  source_display_name: string;
  target_path: string;
  is_read: boolean;
  created_at: string;
}

/** Group notifications by Dubai day into labeled buckets: اليوم / أمس / date */
function groupByDay(items: NotificationItem[]) {
  const todayKey = dubaiDayKey();
  const yesterdayKey = dubaiDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const groups = items.reduce<{ label: string; items: NotificationItem[] }[]>((acc, n) => {
    const key = dubaiDayKey(new Date(n.created_at));
    const label = key === todayKey ? 'اليوم' : key === yesterdayKey ? 'أمس' : key;
    const last = acc[acc.length - 1];
    if (last && last.label === label) {
      last.items.push(n);
    } else {
      acc.push({ label, items: [n] });
    }
    return acc;
  }, []);

  return groups;
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

  const [soundOn, setSoundOn] = useState(() => isNotificationSoundEnabled());
  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setNotificationSoundEnabled(next);
  };

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

  const groups = useMemo(() => groupByDay(notifications), [notifications]);

  return (
    <Popover onOpenChange={(open) => { if (open) requestNotificationPermission(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" title="الإشعارات" aria-label="الإشعارات">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <>
              <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white animate-scale-in">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
              <span className="absolute -top-0.5 -end-0.5 h-4 w-4 rounded-full bg-orange-500/40 animate-pulse-ring" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="text-sm font-semibold">الإشعارات</h4>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSound}
              title={soundOn ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
              aria-label={soundOn ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
            >
              {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />}
            </Button>
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
        </div>

        {/* Notification List */}
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <div className="space-y-0">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-start gap-3 border-b p-3 last:border-b-0">
                  <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState icon={Bell} title="لا توجد إشعارات" className="py-4" />
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-3 pt-2 text-[10px] font-medium text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((n) => {
                  const { icon: Icon, classes } = typeVisual(n.type);
                  return (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`flex w-full items-start gap-3 border-b p-3 text-start transition-colors hover:bg-muted/50 last:border-b-0 ${
                        n.is_read ? 'opacity-75' : 'bg-orange-50/60 dark:bg-orange-950/20'
                      }`}
                    >
                      {/* Type icon chip */}
                      <div
                        className={`flex size-8 flex-shrink-0 items-center justify-center rounded-lg ${classes}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-tight ${n.is_read ? 'font-medium' : 'font-semibold'}`}>
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {n.message}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{n.source_display_name}</span>
                          <span>·</span>
                          <span>{formatRelativeDate(n.created_at)}</span>
                          {!n.is_read && (
                            <span className="ms-1 inline-block size-1.5 flex-shrink-0 rounded-full bg-orange-500" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
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
