'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
import type { QuoteStatus } from '@/lib/constants/statuses';

export interface Quote {
  id: string;
  quote_number: string;
  client_id: string | null;
  lead_id: string | null;
  project_name: string | null;
  status: QuoteStatus;
  estimate_date: string;
  expiry_date: string | null;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  discount_type: string | null;
  discount_value: number;
  discount_amount: number;
  notes: string | null;
  company_name: string | null;
  company_logo: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  entity_id: string | null;
  signature_data: string | null;
  signed_by: string | null;
  created_at: string;
  updated_at: string;
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
