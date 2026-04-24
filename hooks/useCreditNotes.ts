'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface CreditNote {
  id: string;
  invoice_id?: string;
  client_id?: string;
  amount?: number;
  status?: string;
  reason?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useCreditNotes(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<CreditNote[]>({
    queryKey: ['credit-notes', params],
    queryFn: () => fetchAPI(`/api/dashboard/credit-notes${qs}`),
    staleTime: 60_000,
  });
}

export function useCreditNote(id: string | undefined) {
  return useQuery<CreditNote>({
    queryKey: ['credit-notes', id],
    queryFn: () => fetchAPI(`/api/dashboard/credit-notes/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient();
  return useMutation<CreditNote, Error, Partial<CreditNote>>({
    mutationFn: (data) => mutateAPI('/api/dashboard/credit-notes', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
    },
  });
}

export function useUpdateCreditNote() {
  const queryClient = useQueryClient();
  return useMutation<CreditNote, Error, { id: string; data: Partial<CreditNote> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/dashboard/credit-notes/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
      queryClient.invalidateQueries({ queryKey: ['credit-notes', id] });
    },
  });
}

export function useDeleteCreditNote() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/dashboard/credit-notes/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] });
    },
  });
}
