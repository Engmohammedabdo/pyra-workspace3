'use client';

import { useEffect, useRef, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeOptions {
  username: string;
  onNewNotification?: (notification: Record<string, unknown>) => void;
}

/**
 * Subscribe to Supabase Realtime for live notification updates.
 * Listens for INSERT events on pyra_notifications filtered by recipient.
 *
 * Uses a ref for the callback to avoid re-subscribing on every render.
 */
export function useRealtime({ username, onNewNotification }: UseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onNewNotification);

  // Keep the callback ref up-to-date without re-subscribing
  useEffect(() => {
    callbackRef.current = onNewNotification;
  }, [onNewNotification]);

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
          callbackRef.current?.(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [username]); // Only re-subscribe when username changes
}

/**
 * Subscribe to Supabase Realtime for activity log updates.
 * Listens for INSERT events on pyra_activity_log.
 *
 * Uses a ref for the callback to avoid re-subscribing on every render.
 */
export function useRealtimeActivity(onNewActivity?: (activity: Record<string, unknown>) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onNewActivity);

  // Keep the callback ref up-to-date without re-subscribing
  useEffect(() => {
    callbackRef.current = onNewActivity;
  }, [onNewActivity]);

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
          callbackRef.current?.(payload.new as Record<string, unknown>);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []); // Subscribe once, never re-subscribe
}
