'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

// ── Types ──────────────────────────────────────────────────────────────────

export interface AgentWhatsAppSetting {
  id: string;
  agent_username: string;
  sender_instance_name: string;
  recipient_phone: string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined by GET /api/settings/agent-whatsapp-settings */
  agent_display_name?: string | null;
  /** Joined by GET — pyra_whatsapp_instances.status */
  sender_instance_status?: string | null;
  /** Joined by GET — pyra_whatsapp_instances.last_connected_at */
  sender_instance_last_connected_at?: string | null;
}

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * List all agent WhatsApp settings (admin only — backed by
 * settings.view permission). Includes joined display_name + sender
 * instance status so the table can render "pyraai ✅ connected"
 * inline without a second round-trip.
 */
export function useAgentWhatsAppSettings() {
  return useQuery<AgentWhatsAppSetting[]>({
    queryKey: ['agent-whatsapp-settings'],
    queryFn: () => fetchAPI('/api/settings/agent-whatsapp-settings'),
    staleTime: 60_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export interface CreateAgentWhatsAppSettingInput {
  agent_username: string;
  sender_instance_name: string;
  recipient_phone: string;
  is_active?: boolean;
  notes?: string;
}

export function useCreateAgentWhatsAppSetting() {
  const qc = useQueryClient();
  return useMutation<AgentWhatsAppSetting, Error, CreateAgentWhatsAppSettingInput>({
    mutationFn: (data) =>
      mutateAPI('/api/settings/agent-whatsapp-settings', 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-whatsapp-settings'] });
    },
  });
}

export interface UpdateAgentWhatsAppSettingInput {
  id: string;
  sender_instance_name?: string;
  recipient_phone?: string;
  is_active?: boolean;
  notes?: string | null;
}

export function useUpdateAgentWhatsAppSetting() {
  const qc = useQueryClient();
  return useMutation<AgentWhatsAppSetting, Error, UpdateAgentWhatsAppSettingInput>({
    mutationFn: ({ id, ...rest }) =>
      mutateAPI(`/api/settings/agent-whatsapp-settings/${id}`, 'PATCH', rest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-whatsapp-settings'] });
    },
  });
}

export function useDeleteAgentWhatsAppSetting() {
  const qc = useQueryClient();
  return useMutation<{ deleted: true }, Error, string>({
    mutationFn: (id) =>
      mutateAPI(`/api/settings/agent-whatsapp-settings/${id}`, 'DELETE'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-whatsapp-settings'] });
    },
  });
}
