'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

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
// NOTE (finance audit 2026-07-02 cleanup): the dead useQuotes/useQuote/
// useCreateQuote hooks were removed — they pointed at /api/dashboard/quotes
// which never existed (guaranteed 404) and had zero consumers. The real
// quotes endpoint is /api/quotes; useLeadQuotes below is the live consumer.

/**
 * Quotes linked to a specific lead — powers the Lead Detail "Deals" tab quotes
 * card (Gap #5b, closes issue #7). Hits the REAL, scoped `/api/quotes?lead_id=`
 * endpoint; Gap #5a scoping ensures the owning agent sees the lead's quotes
 * (own-created OR on-their-lead), with no cross-agent leak.
 */
export function useLeadQuotes(leadId: string | undefined) {
  return useQuery<Quote[]>({
    queryKey: ['quotes', 'by-lead', leadId],
    queryFn: () => fetchAPI(`/api/quotes?lead_id=${encodeURIComponent(leadId ?? '')}`),
    enabled: !!leadId,
    staleTime: 30_000,
    // Refetch whenever the Deals tab mounts. A quote created via QuoteBuilder
    // uses raw mutateAPI (no React-Query invalidation), so returning to the
    // lead within staleTime would otherwise show a stale list. This guarantees
    // the card reflects a just-created quote on navigate-back.
    refetchOnMount: 'always',
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** تعديل عرض موجود (يستخدم مسار /api/quotes الحقيقي) */
export function useUpdateQuote() {
  const queryClient = useQueryClient();
  return useMutation<Quote, Error, { id: string; data: Partial<Quote> }>({
    mutationFn: ({ id, data }) =>
      mutateAPI(`/api/quotes/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quotes', id] });
    },
  });
}
