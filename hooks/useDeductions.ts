'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import type {
  MonthlyDeductionsReport,
  MonthlyEmployeeDeductionReport,
} from '@/lib/hr/deductions-report';
import type { ManualDeductionBasis } from '@/lib/constants/deductions';

export interface MyDeductionRiskResponse {
  month: string;
  as_of_date: string;
  generated_at: string;
  employee: MonthlyEmployeeDeductionReport;
}

export function useMyDeductionRisk({ enabled }: { enabled: boolean }) {
  return useQuery<MyDeductionRiskResponse>({
    queryKey: ['deductions', 'me'],
    queryFn: () => fetchAPI<MyDeductionRiskResponse>('/api/hr/deductions/me'),
    enabled,
    staleTime: 30_000,
  });
}

export function useAdminDeductions(month: string) {
  return useQuery<MonthlyDeductionsReport>({
    queryKey: ['deductions', 'admin', month],
    queryFn: () => fetchAPI<MonthlyDeductionsReport>(
      `/api/hr/deductions?month=${encodeURIComponent(month)}`,
    ),
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
    staleTime: 30_000,
  });
}

export interface ApproveComputedDeductionInput {
  username: string;
  /** First day of the current payroll month, in YYYY-MM-01 form. */
  period_month: string;
}

export interface ApproveComputedDeductionResponse {
  deduction_case: Record<string, unknown>;
}

export function useApproveComputedDeduction() {
  const queryClient = useQueryClient();
  return useMutation<
    ApproveComputedDeductionResponse,
    Error,
    ApproveComputedDeductionInput
  >({
    mutationFn: (input) => mutateAPI<ApproveComputedDeductionResponse>(
      '/api/hr/deductions/approve',
      'POST',
      input,
    ),
    onSuccess: (_result, input) => {
      const month = input.period_month.slice(0, 7);
      queryClient.invalidateQueries({ queryKey: ['deductions', 'admin', month] });
      queryClient.invalidateQueries({ queryKey: ['deductions', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['hr-overview'] });
      queryClient.invalidateQueries({ queryKey: ['employee-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['my-payslips'] });
    },
    onError: (error, input) => {
      if (error instanceof ApiError && error.status === 409) {
        queryClient.invalidateQueries({
          queryKey: ['deductions', 'admin', input.period_month.slice(0, 7)],
        });
      }
    },
  });
}

export interface SetAttendanceTrackingStartInput {
  username: string;
  started_on: string;
}

export function useSetAttendanceTrackingStart(month: string) {
  const queryClient = useQueryClient();
  return useMutation<
    {
      username: string;
      attendance_tracking_started_on: string;
      attendance_tracking_start_source: 'admin';
    },
    Error,
    SetAttendanceTrackingStartInput
  >({
    mutationFn: (input) => mutateAPI(
      '/api/hr/deductions/attendance-tracking',
      'PATCH',
      input,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deductions', 'admin', month] });
      queryClient.invalidateQueries({ queryKey: ['deductions', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['hr-overview'] });
    },
  });
}

export interface ApproveManualDeductionInput {
  idempotency_key: string;
  username: string;
  /** First day of the payroll month, in YYYY-MM-01 form. */
  period_month: string;
  amount: number;
  reason: string;
  basis: ManualDeductionBasis;
  evidence_task_ids: string[];
  owner_attestation: boolean;
}

export interface ApproveManualDeductionResponse {
  manual_deduction: Record<string, unknown>;
  payment: Record<string, unknown>;
}

export function useApproveManualDeduction() {
  const queryClient = useQueryClient();
  return useMutation<
    ApproveManualDeductionResponse,
    Error,
    ApproveManualDeductionInput
  >({
    mutationFn: (input) => mutateAPI<ApproveManualDeductionResponse>(
      '/api/hr/deductions/manual',
      'POST',
      input,
    ),
    onSuccess: (_result, input) => {
      const month = input.period_month.slice(0, 7);
      queryClient.invalidateQueries({ queryKey: ['deductions', 'admin', month] });
      queryClient.invalidateQueries({ queryKey: ['hr-overview'] });
      queryClient.invalidateQueries({ queryKey: ['employee-payments'] });
      queryClient.invalidateQueries({ queryKey: ['payroll'] });
      queryClient.invalidateQueries({ queryKey: ['my-payslips'] });
    },
    onError: (error, input) => {
      if (error instanceof ApiError && error.status === 409) {
        queryClient.invalidateQueries({
          queryKey: ['deductions', 'admin', input.period_month.slice(0, 7)],
        });
      }
    },
  });
}
