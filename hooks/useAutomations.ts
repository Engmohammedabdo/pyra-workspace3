'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Automation {
  id: string;
  name: string;
  description?: string;
  status?: 'active' | 'inactive' | string;
  trigger?: string;
  enabled?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AutomationLogEntry {
  id: string;
  automation_id?: string;
  status?: string;
  message?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة الأتمتة */
export function useAutomations() {
  return useQuery<Automation[]>({
    queryKey: ['automations'],
    queryFn: () => fetchAPI('/api/automations'),
    staleTime: 60_000,
  });
}

/** أتمتة واحدة بالـ ID */
export function useAutomation(id: string | undefined) {
  return useQuery<Automation>({
    queryKey: ['automations', id],
    queryFn: () => fetchAPI(`/api/automations/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** سجل تشغيل الأتمتة */
export function useAutomationLog() {
  return useQuery<AutomationLogEntry[]>({
    queryKey: ['automations', 'log'],
    queryFn: () => fetchAPI('/api/automations/log'),
    staleTime: 15_000, // يتحدث أسرع لأنه سجل نشط
    refetchInterval: 30_000,
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** تفعيل/تعطيل أتمتة */
export function useToggleAutomation() {
  const queryClient = useQueryClient();
  return useMutation<Automation, Error, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) =>
      mutateAPI(`/api/automations/${id}/toggle`, 'POST', { enabled }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automations', id] });
    },
  });
}
