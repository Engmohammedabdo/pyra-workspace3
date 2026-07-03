'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraOnboarding, PyraOnboardingTask } from '@/types/database';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface OnboardingListItem {
  id: string;
  employee_username: string;
  employee_display_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  notes: string | null;
  task_progress: { done: number; total: number };
}

export interface OnboardingDocument {
  id: string;
  employee_username: string;
  type_id: string;
  label: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
  notes: string | null;
  signed_url: string;
}

export interface OnboardingDetail extends PyraOnboarding {
  tasks: PyraOnboardingTask[];
  documents: OnboardingDocument[];
}

export interface CreateOnboardingInput {
  // personal
  nameEn: string;
  nameAr: string;
  nationality: string;
  passport: string;
  idNumber: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  username: string;
  /** Required for new hires; omitted in existing-employee mode (account untouched). */
  password?: string;
  // position
  titleEn: string;
  titleAr: string;
  deptEn: string;
  deptAr: string;
  reportsTo: string;
  startDate: string;
  isSales: boolean;
  /** Default: 'full_time' */
  employment_type?: string;
  /** Default: 'onsite' */
  work_location?: string;
  // compensation (numbers)
  basic: number;
  housing: number;
  transport: number;
  communication: number;
  other: number;
  commissionRate?: number;
  monthlyTarget?: number;
  /** ISO 4217 salary currency (SALARY_CURRENCIES) — default 'AED'. */
  currency?: string;
  // existing-employee mode
  /** When true, the API adopts an existing ACTIVE user instead of creating one. */
  existing_employee?: boolean;
  /** Documents subset to generate (existing mode only) — default all three. */
  documents?: string[];
  // custom + assets
  customClauses: Array<{ title?: string; body: string }>;
  assets: Array<{
    type: string;
    description: string;
    serial: string;
    condition: string;
    value: string;
    notes: string;
  }>;
  // signatory
  signatoryName: string;
  signatoryTitle: string;
  notes?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────────────────────

export function useOnboardingList() {
  return useQuery<{ onboardings: OnboardingListItem[] }>({
    queryKey: ['onboarding'],
    queryFn: () => fetchAPI('/api/hr/onboarding'),
    staleTime: 30_000,
  });
}

export function useOnboarding(id: string | undefined) {
  return useQuery<OnboardingDetail>({
    queryKey: ['onboarding', id],
    queryFn: () => fetchAPI(`/api/hr/onboarding/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Mutations
// ────────────────────────────────────────────────────────────────────────────

export function useCreateOnboarding() {
  const qc = useQueryClient();
  return useMutation<
    { id: string; employee_username: string; documents: unknown[] },
    Error,
    CreateOnboardingInput
  >({
    mutationFn: (data) => mutateAPI('/api/hr/onboarding', 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { id: string; action: 'complete' | 'cancel'; notes?: string }
  >({
    mutationFn: ({ id, ...body }) =>
      mutateAPI(`/api/hr/onboarding/${id}`, 'PATCH', body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      qc.invalidateQueries({ queryKey: ['onboarding', vars.id] });
      // cancel sets the linked user status='inactive' server-side — refresh users list
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useToggleOnboardingTask() {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { onboardingId: string; taskId: string; is_done: boolean }
  >({
    mutationFn: ({ onboardingId, taskId, is_done }) =>
      mutateAPI(
        `/api/hr/onboarding/${onboardingId}/tasks/${taskId}`,
        'PATCH',
        { is_done },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['onboarding', vars.onboardingId] });
      qc.invalidateQueries({ queryKey: ['onboarding'] });
    },
  });
}

export function useRegenerateDocument() {
  const qc = useQueryClient();
  return useMutation<
    { doc_id: string; type_id: string },
    Error,
    { onboardingId: string; docType: 'offer_letter' | 'nda' | 'asset_handover' }
  >({
    mutationFn: ({ onboardingId, docType }) =>
      mutateAPI(
        `/api/hr/onboarding/${onboardingId}/documents/${docType}/regenerate`,
        'POST',
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['onboarding', vars.onboardingId] });
    },
  });
}
