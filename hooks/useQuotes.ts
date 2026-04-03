'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Quote {
  id: string;
  quote_number?: string;
  client_id?: string;
  project_id?: string;
  status?: string;
  amount?: number;
  valid_until?: string;
  issued_date?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة العروض مع فلترة اختيارية */
export function useQuotes(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Quote[]>({
    queryKey: ['quotes', params],
    queryFn: () => fetchAPI(`/api/dashboard/quotes${qs}`),
    staleTime: 30_000,
  });
}

/** عرض واحد بالـ ID */
export function useQuote(id: string | undefined) {
  return useQuery<Quote>({
    queryKey: ['quotes', id],
    queryFn: () => fetchAPI(`/api/dashboard/quotes/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** إنشاء عرض جديد */
export function useCreateQuote() {
  const queryClient = useQueryClient();
  return useMutation<Quote, Error, Partial<Quote>>({
    mutationFn: (data) => mutateAPI('/api/dashboard/quotes', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

/** تعديل عرض موجود */
export function useUpdateQuote() {
  const queryClient = useQueryClient();
  return useMutation<Quote, Error, { id: string; data: Partial<Quote> }>({
    mutationFn: ({ id, data }) =>
      mutateAPI(`/api/dashboard/quotes/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });
}
