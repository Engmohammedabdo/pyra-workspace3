'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================

export interface Conversation {
  id?: string;
  remote_jid: string;
  instance_name: string;
  lead_id: string | null;
  client_id: string | null;
  contact_name: string | null;
  contact_phone?: string | null;
  phone: string | null;
  last_message: string | null;
  last_message_type?: string;
  last_message_at?: string | null;
  last_timestamp?: string;
  unread_count: number;
  total_messages?: number;
  assigned_to?: string | null;
  is_pinned?: boolean;
  is_archived?: boolean;
  status?: string;      // open | pending | resolved
  priority?: string;    // low | normal | high | urgent
}

export interface ConversationsResponse {
  data: Conversation[];
  meta?: {
    counts?: Record<string, number>;
  };
}

export interface Message {
  id: string;
  direction: string;
  content: string | null;
  message_type: string;
  media_url?: string | null;
  file_name?: string | null;
  status: string;
  timestamp: string;
}

export interface ConversationNote {
  id: string;
  author_display_name: string;
  content: string;
  created_at: string;
}

export interface WhatsAppTemplate {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** Fetch conversations with filter params (status, assigned) */
export function useConversations(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<ConversationsResponse>({
    queryKey: ['whatsapp-conversations', params],
    queryFn: async () => {
      const result = await fetchAPI<any>(`/api/dashboard/sales/whatsapp/conversations${qs}`);
      // API may return data + meta.counts or just an array
      const data = Array.isArray(result) ? result : (result?.data || result || []);
      const meta = result?.meta || undefined;
      return {
        data: Array.isArray(data) ? data : [],
        meta,
      };
    },
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

/** Fetch messages for a specific conversation */
export function useMessages(conversationId: string | undefined, remoteJid?: string) {
  return useQuery<Message[]>({
    queryKey: ['whatsapp-messages', conversationId || remoteJid],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (conversationId) {
        params.set('conversation_id', conversationId);
      } else if (remoteJid) {
        params.set('remote_jid', remoteJid);
      }
      const msgs = await fetchAPI<Message[]>(`/api/dashboard/sales/whatsapp/messages?${params}`);
      return (msgs || []).reverse();
    },
    enabled: !!(conversationId || remoteJid),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

/** Fetch internal notes for a conversation */
export function useConversationNotes(conversationId: string | undefined) {
  return useQuery<ConversationNote[]>({
    queryKey: ['whatsapp-notes', conversationId],
    queryFn: () =>
      fetchAPI<ConversationNote[]>(
        `/api/dashboard/sales/whatsapp/conversations/${conversationId}/notes`
      ),
    enabled: !!conversationId,
    staleTime: 15_000,
  });
}

/** Fetch canned response templates */
export function useWhatsAppTemplates() {
  return useQuery<WhatsAppTemplate[]>({
    queryKey: ['whatsapp-templates'],
    queryFn: () => fetchAPI<WhatsAppTemplate[]>('/api/dashboard/sales/whatsapp/templates'),
    staleTime: 60_000,
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** Send a WhatsApp text message */
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      instance_name: string;
      remote_jid: string;
      conversation_id?: string;
      number: string;
      text: string;
      lead_id?: string | null;
    }) => mutateAPI('/api/dashboard/sales/whatsapp/send', 'POST', payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ['whatsapp-messages', variables.conversation_id || variables.remote_jid],
      });
    },
  });
}

/** Send a WhatsApp media message */
export function useSendMediaMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      instance_name: string;
      remote_jid: string;
      conversation_id?: string;
      number: string;
      text?: string;
      media_url: string;
      media_type: string;
      mime_type: string;
      file_name: string;
      lead_id?: string | null;
    }) => mutateAPI('/api/dashboard/sales/whatsapp/send', 'POST', payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ['whatsapp-messages', variables.conversation_id || variables.remote_jid],
      });
    },
  });
}

/** Assign a conversation to an agent */
export function useAssignConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      conversationId?: string | null;
      remoteJid: string;
      instanceName: string;
      assignedTo: string | null;
    }) => {
      if (payload.conversationId) {
        return mutateAPI(
          `/api/dashboard/sales/whatsapp/conversations/${payload.conversationId}/assign`,
          'POST',
          { assigned_to: payload.assignedTo }
        );
      }
      // Legacy fallback
      return mutateAPI('/api/dashboard/sales/whatsapp/assignments', 'POST', {
        remote_jid: payload.remoteJid,
        instance_name: payload.instanceName,
        assigned_to: payload.assignedTo,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}

/** Update conversation status (open/pending/resolved) */
export function useUpdateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      conversationId: string;
      data: Record<string, unknown>;
    }) =>
      mutateAPI(
        `/api/dashboard/sales/whatsapp/conversations/${payload.conversationId}`,
        'PATCH',
        payload.data
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}

/** Add an internal note to a conversation */
export function useAddConversationNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { conversationId: string; content: string }) =>
      mutateAPI(
        `/api/dashboard/sales/whatsapp/conversations/${payload.conversationId}/notes`,
        'POST',
        { content: payload.content }
      ),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ['whatsapp-notes', variables.conversationId],
      });
    },
  });
}

/** Poll Evolution API for new messages */
export function usePollWhatsApp() {
  return useMutation({
    mutationFn: () =>
      fetch('/api/dashboard/sales/whatsapp/poll', { method: 'POST' }).then(() => undefined),
  });
}
