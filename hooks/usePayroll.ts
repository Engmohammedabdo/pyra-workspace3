'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

export interface PayrollItem {
  id: string;
  payroll_id: string;
  username: string;
  display_name?: string;
  department?: string | null;
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  commission: number;
  deductions: number;
  deduction_details: Array<{ type: string; amount: number }>;
  net_pay: number;
  status: string;
}

export interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  total_amount: number;
  currency: string;
  employee_count: number;
  calculated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  items?: PayrollItem[];
}

export function usePayrollRuns(year: string) {
  return useQuery<PayrollRun[]>({
    queryKey: ['payroll', year],
    queryFn: () => fetchAPI(`/api/dashboard/payroll?year=${year}`),
    staleTime: 60_000,
  });
}

export function usePayrollRun(id: string | undefined) {
  return useQuery<PayrollRun>({
    queryKey: ['payroll-run', id],
    queryFn: () => fetchAPI(`/api/dashboard/payroll/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export interface EmployeePaymentRow {
  id: string;
  source_type: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface MyPayslipRow extends PayrollItem {
  month: number;
  year: number;
  run_status: string;
  currency: string;
  paid_at: string | null;
}

export interface PayslipsResponse {
  payslips: MyPayslipRow[];
  payments: EmployeePaymentRow[];
}

export function useMyPayslips() {
  return useQuery<PayslipsResponse>({
    queryKey: ['my-payslips'],
    queryFn: () => fetchAPI('/api/dashboard/my-payslips'),
    staleTime: 5 * 60_000,
  });
}

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['payroll'] });
}

export function useCreatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { month: number; year: number; notes?: string }) =>
      mutateAPI('/api/dashboard/payroll', 'POST', input),
    onSuccess: () => invalidatePayroll(qc),
  });
}

export function useCalculatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) =>
      mutateAPI(`/api/dashboard/payroll/${runId}/calculate`, 'POST', {}),
    onSuccess: (_d, runId) => {
      invalidatePayroll(qc);
      qc.invalidateQueries({ queryKey: ['payroll-run', runId] });
    },
  });
}

export function useUpdatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: 'approve' | 'pay' }) =>
      mutateAPI(`/api/dashboard/payroll/${runId}`, 'PATCH', { action }),
    onSuccess: () => invalidatePayroll(qc),
  });
}
