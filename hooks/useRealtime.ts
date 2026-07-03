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
 * Subscribe to task changes on ONE board (INSERT/UPDATE/DELETE on
 * pyra_tasks filtered by board_id). The callback is debounced by the
 * caller-supplied delay because a single drag-move UPDATEs many sibling
 * rows (position compaction) — one refetch per burst, not per row.
 */
export function useRealtimeBoardTasks(boardId: string | null, onChange?: () => void, debounceMs = 600) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(onChange);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { callbackRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!boardId) return;
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`board-tasks:${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pyra_tasks', filter: `board_id=eq.${boardId}` },
        () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => { callbackRef.current?.(); }, debounceMs);
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [boardId, debounceMs]);
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
