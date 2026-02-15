'use client';

import { useEffect, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  username: string;
  onNewNotification?: (notification: Record<string, unknown>) => void;
}

/**
 * Subscribe to Supabase Realtime for live notification updates.
 * Listens for INSERT events on pyra_notifications filtered by recipient.
 */
export function useRealtime({ username, onNewNotification }: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!username) return;

    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`notifications:${username}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pyra_notifications',
          filter: `recipient_username=eq.${username}`,
        },
        (payload) => {
          onNewNotification?.(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [username, onNewNotification]);
}

/**
 * Subscribe to Supabase Realtime for activity log updates.
 * Listens for INSERT events on pyra_activity_log.
 */
export function useRealtimeActivity(onNewActivity?: (activity: Record<string, unknown>) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel('activity-feed')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pyra_activity_log',
        },
        (payload) => {
          onNewActivity?.(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [onNewActivity]);
}
