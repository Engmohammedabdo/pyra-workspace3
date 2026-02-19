'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

// ── Types ──

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

interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

// ── Admin Notifications (with Supabase Realtime) ──

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10');
      const json = await res.json();
      if (json.data) {
        setNotifications(json.data);
        setUnreadCount(json.meta?.unread_count ?? json.data.filter((n: Notification) => !n.is_read).length);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 30 seconds as fallback
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silently fail
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silently fail
    }
  }, []);

  return { notifications, unreadCount, loading, refresh, markRead, markAllRead };
}

// ── Portal Notifications (Supabase Realtime + Desktop Push) ──

interface PortalNotificationPayload {
  id: string;
  type: string;
  title?: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export function usePortalNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const clientIdRef = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserSupabaseClient>['channel']> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/notifications?unread_only=true');
      const json = await res.json();
      if (json.data) {
        setUnreadCount(json.data.length);
      }
      // Extract client_id from meta if available
      if (json.meta?.client_id) {
        clientIdRef.current = json.meta.client_id;
      }
    } catch {
      // silently fail
    }
  }, []);

  // Subscribe to Supabase Realtime for instant notifications
  useEffect(() => {
    let mounted = true;

    async function setupRealtime() {
      // Initial fetch
      await refresh();

      // Only set up realtime if we have a client_id
      const clientId = clientIdRef.current;
      if (!clientId) return;

      try {
        const supabase = createBrowserSupabaseClient();

        const channel = supabase
          .channel(`portal-notifications-${clientId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'pyra_client_notifications',
              filter: `client_id=eq.${clientId}`,
            },
            (payload) => {
              if (!mounted) return;
              const newNotification = payload.new as PortalNotificationPayload;

              // Increment unread count instantly
              setUnreadCount(prev => prev + 1);

              // Show desktop notification
              showDesktopNotification(
                newNotification.title || 'إشعار جديد',
                newNotification.message
              );
            }
          )
          .subscribe();

        channelRef.current = channel;
      } catch {
        // Realtime not available, fall back to polling
      }
    }

    setupRealtime();

    // Fallback polling every 30 seconds (for when Realtime isn't working)
    const interval = setInterval(refresh, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
      // Unsubscribe from Realtime
      if (channelRef.current) {
        const supabase = createBrowserSupabaseClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refresh]);

  return { unreadCount, refresh };
}

// ── Desktop Push Notifications ──

/** Request notification permission from the user */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return Promise.resolve('denied' as NotificationPermission);
  }
  if (Notification.permission === 'granted') {
    return Promise.resolve('granted');
  }
  if (Notification.permission === 'denied') {
    return Promise.resolve('denied');
  }
  return Notification.requestPermission();
}

/** Show a desktop notification if permission is granted */
function showDesktopNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  // Don't show if the page is focused
  if (document.hasFocus()) return;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-192.svg',
      tag: 'pyra-portal',
      dir: 'rtl',
      lang: 'ar',
      requireInteraction: false,
      silent: false,
    });

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    // Focus the window on click
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Notification failed, ignore
  }
}
