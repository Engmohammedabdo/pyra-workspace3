'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI, buildQueryString } from './api-helpers';

export interface PayrollRecord {
  id: string;
  employee_id?: string;
  period?: string;
  gross_salary?: number;
  net_salary?: number;
  deductions?: number;
  status?: string;
  payment_date?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function usePayroll(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<PayrollRecord[]>({
    queryKey: ['payroll', params],
    queryFn: () => fetchAPI(`/api/dashboard/payroll${qs}`),
    staleTime: 60_000,
  });
}

export function usePayrollRecord(id: string | undefined) {
  return useQuery<PayrollRecord>({
    queryKey: ['payroll', id],
    queryFn: () => fetchAPI(`/api/dashboard/payroll/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}
