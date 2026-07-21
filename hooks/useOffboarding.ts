'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { HandoverList, HandoverDecisions, HandoverResult } from '@/lib/hr/handover';
import type { FinalSettlement } from '@/lib/hr/final-settlement';

export interface ExitPreview {
  employee: {
    username: string;
    display_name: string;
    salary: number | null;
    currency: string | null;
    hire_date: string | null;
  };
  handover: HandoverList;
  settlement_preview: FinalSettlement;
}

export function useExitPreview(username: string | undefined) {
  return useQuery<ExitPreview>({
    queryKey: ['exit-preview', username],
    queryFn: () => fetchAPI(`/api/users/${username}/exit`),
    enabled: !!username,
    staleTime: 30_000,
  });
}

export interface SubmitExitInput {
  username: string;
  last_working_day: string;
  exit_reason: string;
  exit_notes?: string;
  handover: HandoverDecisions;
}

export interface SubmitExitResult {
  offboarding_id: string;
  locked: boolean;
  lock_error?: string;
  settlement: FinalSettlement;
  handover_results: HandoverResult;
}

export function useSubmitExit() {
  const qc = useQueryClient();
  return useMutation<SubmitExitResult, Error, SubmitExitInput>({
    mutationFn: ({ username, ...body }) => mutateAPI(`/api/users/${username}/exit`, 'POST', body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', vars.username] });
    },
  });
}

// For the suspend / reactivate buttons — a plain status PATCH (the existing route).
export function useSetUserStatus() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { username: string; status: 'active' | 'suspended' }>({
    mutationFn: ({ username, status }) => mutateAPI(`/api/users/${username}`, 'PATCH', { status }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', vars.username] });
    },
  });
}
