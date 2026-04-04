'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================

export interface ConversationLabel {
  id: string;
  name: string;
  name_ar: string;
  color: string;
  description?: string | null;
  created_by?: string;
  created_at?: string;
  assigned_by?: string;
  assigned_at?: string;
}

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
  is_muted?: boolean;
  status?: string;      // open | pending | resolved
  priority?: string;    // low | normal | high | urgent
  custom_attributes?: Record<string, string> | null;
  merged_into_id?: string | null;
  team_id?: string | null;
  snoozed_until?: string | null;
  first_reply_at?: string | null;
  waiting_since?: string | null;
  labels?: ConversationLabel[];
  created_at?: string;
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
  const qc = useQueryClient();
  const prevCountRef = { current: 0 };

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
      const result = (msgs || []).reverse();

      // When messages are fetched, the API clears unread_count.
      // Invalidate conversations so the badge updates immediately.
      if (result.length !== prevCountRef.current) {
        prevCountRef.current = result.length;
        qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      }

      return result;
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

// ============================================================
// Hooks: Labels
// ============================================================

/** Fetch all conversation labels */
export function useConversationLabels() {
  return useQuery<ConversationLabel[]>({
    queryKey: ['whatsapp-labels'],
    queryFn: () => fetchAPI<ConversationLabel[]>('/api/dashboard/sales/whatsapp/labels'),
    staleTime: 60_000,
  });
}

/** Fetch labels assigned to a specific conversation */
export function useConversationLabelAssignments(conversationId: string | undefined) {
  return useQuery<ConversationLabel[]>({
    queryKey: ['whatsapp-conversation-labels', conversationId],
    queryFn: () =>
      fetchAPI<ConversationLabel[]>(
        `/api/dashboard/sales/whatsapp/conversations/${conversationId}/labels`
      ),
    enabled: !!conversationId,
    staleTime: 30_000,
  });
}

/** Create a new label */
export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; name_ar?: string; color: string; description?: string }) =>
      mutateAPI('/api/dashboard/sales/whatsapp/labels', 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-labels'] });
    },
  });
}

/** Assign a label to a conversation */
export function useAssignLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { conversationId: string; labelId: string }) =>
      mutateAPI(
        `/api/dashboard/sales/whatsapp/conversations/${payload.conversationId}/labels`,
        'POST',
        { label_id: payload.labelId }
      ),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['whatsapp-conversation-labels', variables.conversationId] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}

/** Remove a label from a conversation */
export function useRemoveLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { conversationId: string; labelId: string }) =>
      mutateAPI(
        `/api/dashboard/sales/whatsapp/conversations/${payload.conversationId}/labels`,
        'DELETE',
        { label_id: payload.labelId }
      ),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['whatsapp-conversation-labels', variables.conversationId] });
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}

// ============================================================
// Hooks: Bulk Actions
// ============================================================

/** Bulk update conversations */
export function useBulkUpdateConversations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      ids: string[];
      action: 'assign' | 'status' | 'priority' | 'label' | 'snooze' | 'mute';
      value: Record<string, unknown>;
    }) =>
      mutateAPI('/api/dashboard/sales/whatsapp/conversations/bulk', 'POST', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
    },
  });
}
