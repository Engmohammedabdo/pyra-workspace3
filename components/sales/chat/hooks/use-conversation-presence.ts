'use client';

import { useState, useEffect, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface PresenceState {
  otherViewers: string[];
  typingAgents: string[];
}

/**
 * Track which agents are viewing a conversation using Supabase Realtime Presence.
 * Returns list of other agents (excluding self) currently viewing.
 */
export function useConversationPresence(conversationId: string | undefined): PresenceState {
  const { data: currentUser } = useCurrentUser();
  const [otherViewers, setOtherViewers] = useState<string[]>([]);
  const [typingAgents, setTypingAgents] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!conversationId || !currentUser?.username) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase.channel(`presence:conv:${conversationId}`, {
      config: { presence: { key: currentUser.username } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const viewers: string[] = [];
        const typers: string[] = [];

        for (const [username, entries] of Object.entries(state)) {
          if (username === currentUser.username) continue;
          viewers.push(username);
          const presences = entries as Array<{ typing?: boolean }>;
          if (presences.some((p) => p.typing)) {
            typers.push(username);
          }
        }

        setOtherViewers(viewers);
        setTypingAgents(typers);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            username: currentUser.username,
            display_name: currentUser.display_name,
            typing: false,
            joined_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [conversationId, currentUser?.username, currentUser?.display_name]);

  return { otherViewers, typingAgents };
}
