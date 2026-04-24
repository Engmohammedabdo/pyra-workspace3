'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

import type { ExpenseStatus } from '@/lib/constants/statuses';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  vat_amount: number;
  category_id: string | null;
  vendor: string | null;
  expense_date: string;
  status: ExpenseStatus;
  payment_method: string | null;
  receipt_url: string | null;
  project_id: string | null;
  subscription_id: string | null;
  supplier_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useExpenses(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Expense[]>({
    queryKey: ['expenses', params],
    queryFn: () => fetchAPI(`/api/finance/expenses${qs}`),
    staleTime: 60_000,
  });
}

export function useExpense(id: string | undefined) {
  return useQuery<Expense>({
    queryKey: ['expenses', id],
    queryFn: () => fetchAPI(`/api/finance/expenses/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation<Expense, Error, Partial<Expense>>({
    mutationFn: (data) => mutateAPI('/api/finance/expenses', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation<Expense, Error, { id: string; data: Partial<Expense> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/finance/expenses/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', id] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/finance/expenses/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
