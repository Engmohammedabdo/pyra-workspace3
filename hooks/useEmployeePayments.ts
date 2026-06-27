'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface EmployeePayment {
  id: string;
  username: string;
  display_name?: string;
  source_type: string;
  amount: number;
  currency: string;
  status: string;
  payroll_id: string | null;
  description: string | null;
  created_at: string;
}

export function useEmployeePayments(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<EmployeePayment[]>({
    queryKey: ['employee-payments', params],
    queryFn: () => fetchAPI(`/api/dashboard/employee-payments${qs}`),
    staleTime: 30_000,
  });
}

export function useCreateEmployeePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      username: string; source_type: string; description: string;
      amount: number; currency?: string;
    }) => mutateAPI('/api/dashboard/employee-payments', 'POST', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-payments'] }),
  });
}

export function useUpdateEmployeePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; status?: string; amount?: number; description?: string }) =>
      mutateAPI(`/api/dashboard/employee-payments/${id}`, 'PATCH', patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-payments'] }),
  });
}
