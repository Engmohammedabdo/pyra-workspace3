'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface RecurringInvoice {
  id: string;
  client_id?: string;
  frequency?: string;
  next_date?: string;
  status?: string;
  amount?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useRecurringInvoices(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<RecurringInvoice[]>({
    queryKey: ['recurring-invoices', params],
    queryFn: () => fetchAPI(`/api/recurring-invoices${qs}`),
    staleTime: 60_000,
  });
}

export function useRecurringInvoice(id: string | undefined) {
  return useQuery<RecurringInvoice>({
    queryKey: ['recurring-invoices', id],
    queryFn: () => fetchAPI(`/api/recurring-invoices/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateRecurringInvoice() {
  const queryClient = useQueryClient();
  return useMutation<RecurringInvoice, Error, Partial<RecurringInvoice>>({
    mutationFn: (data) => mutateAPI('/api/recurring-invoices', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
    },
  });
}

export function useUpdateRecurringInvoice() {
  const queryClient = useQueryClient();
  return useMutation<RecurringInvoice, Error, { id: string; data: Partial<RecurringInvoice> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/recurring-invoices/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices', id] });
    },
  });
}

export function useDeleteRecurringInvoice() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/recurring-invoices/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-invoices'] });
    },
  });
}
