'use client';

/**
 * Phase 15.1 Commit 2 — per-lead tasks React Query hooks.
 *
 * Endpoints:
 *   GET    /api/crm/leads/[id]/tasks         → useLeadTasks(leadId)
 *   POST   /api/crm/leads/[id]/tasks         → useCreateLeadTask()
 *   PATCH  /api/crm/leads/[id]/tasks/[tid]   → useUpdateLeadTask()
 *   DELETE /api/crm/leads/[id]/tasks/[tid]   → useDeleteLeadTask()
 *
 * Cache invalidation on mutations:
 *   - ['crm','leads',leadId,'tasks']           (the tasks tab list)
 *   - ['crm','leads',leadId,'activities']      (dual-write surfaces in timeline)
 *   - ['crm','leads',leadId]                   (lead detail header, in case
 *                                                future fields show task counts)
 *   - ['my-tasks']                             (cross-user aggregator — only
 *                                                the assignee's view changes,
 *                                                but the cost of invalidating
 *                                                here is one extra refetch on
 *                                                next focus — acceptable)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraLeadTask, LeadTaskStatus, LeadTaskPriority } from '@/types/database';

interface LeadTasksResponse {
  tasks: PyraLeadTask[];
}

export function useLeadTasks(leadId: string | undefined) {
  return useQuery<LeadTasksResponse>({
    queryKey: ['crm', 'leads', leadId, 'tasks'],
    queryFn: () => fetchAPI(`/api/crm/leads/${leadId}/tasks`),
    enabled: !!leadId,
    staleTime: 30_000,
  });
}

export interface CreateLeadTaskInput {
  lead_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
  priority?: LeadTaskPriority | null;
  assigned_to?: string | null;
}

export function useCreateLeadTask() {
  const qc = useQueryClient();
  return useMutation<{ task: PyraLeadTask }, Error, CreateLeadTaskInput>({
    mutationFn: ({ lead_id, ...rest }) =>
      mutateAPI(`/api/crm/leads/${lead_id}/tasks`, 'POST', rest),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'activities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}

export interface UpdateLeadTaskInput {
  lead_id: string;
  task_id: string;
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: LeadTaskPriority | null;
  status?: LeadTaskStatus;
  assigned_to?: string | null;
}

export function useUpdateLeadTask() {
  const qc = useQueryClient();
  return useMutation<{ task: PyraLeadTask }, Error, UpdateLeadTaskInput>({
    mutationFn: ({ lead_id, task_id, ...rest }) =>
      mutateAPI(`/api/crm/leads/${lead_id}/tasks/${task_id}`, 'PATCH', rest),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'activities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}

export interface DeleteLeadTaskInput {
  lead_id: string;
  task_id: string;
}

export function useDeleteLeadTask() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, Error, DeleteLeadTaskInput>({
    mutationFn: ({ lead_id, task_id }) =>
      mutateAPI(`/api/crm/leads/${lead_id}/tasks/${task_id}`, 'DELETE'),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'activities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
}
