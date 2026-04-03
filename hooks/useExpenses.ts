'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Expense {
  id: string;
  title?: string;
  amount?: number;
  category?: string;
  date?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useExpenses(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Expense[]>({
    queryKey: ['expenses', params],
    queryFn: () => fetchAPI(`/api/expenses${qs}`),
    staleTime: 60_000,
  });
}

export function useExpense(id: string | undefined) {
  return useQuery<Expense>({
    queryKey: ['expenses', id],
    queryFn: () => fetchAPI(`/api/expenses/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation<Expense, Error, Partial<Expense>>({
    mutationFn: (data) => mutateAPI('/api/expenses', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation<Expense, Error, { id: string; data: Partial<Expense> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/expenses/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses', id] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/expenses/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
}
