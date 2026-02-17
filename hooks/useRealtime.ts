'use client';

import { useEffect, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================
// Supabase Realtime Hooks
// ============================================================

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
  const callbackRef = useRef(onNewNotification);

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
  }, [username]);
}

/**
 * Subscribe to Supabase Realtime for activity log updates.
 */
export function useRealtimeActivity(onNewActivity?: (activity: Record<string, unknown>) => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onNewActivity);

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
  }, []);
}

/**
 * Subscribe to file index changes (uploads, deletes, renames).
 */
export function useRealtimeFiles(onFileChange?: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onFileChange);

  useEffect(() => {
    callbackRef.current = onFileChange;
  }, [onFileChange]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel('file-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pyra_file_index',
        },
        () => {
          callbackRef.current?.();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);
}

/**
 * Subscribe to project changes (status updates, new projects).
 */
export function useRealtimeProjects(onProjectChange?: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onProjectChange);

  useEffect(() => {
    callbackRef.current = onProjectChange;
  }, [onProjectChange]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel('project-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pyra_projects',
        },
        () => {
          callbackRef.current?.();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);
}

/**
 * Subscribe to comment changes for a specific project.
 */
export function useRealtimeComments(projectId: string | null, onNewComment?: () => void) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onNewComment);

  useEffect(() => {
    callbackRef.current = onNewComment;
  }, [onNewComment]);

  useEffect(() => {
    if (!projectId) return;

    const supabase = createBrowserSupabaseClient();

    const channel = supabase
      .channel(`comments:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pyra_client_comments',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          callbackRef.current?.();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId]);
}
