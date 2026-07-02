'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';
import type { CreditNoteStatus } from '@/lib/constants/statuses';

export interface PortalCreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string | null;
  invoice_number: string | null;
  reason: string | null;
  status: CreditNoteStatus;
  issue_date: string;
  currency: string;
  total: number;
  applied_amount: number;
  created_at: string;
}

export interface PortalCreditNoteItem {
  id: string;
  credit_note_id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
  created_at: string;
}

export interface PortalCreditNoteDetail extends PortalCreditNote {
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  notes: string | null;
  items: PortalCreditNoteItem[];
}

export function usePortalCreditNotes() {
  return useQuery<PortalCreditNote[]>({
    queryKey: ['portal', 'credit-notes'],
    queryFn: () => fetchAPI('/api/portal/credit-notes'),
    staleTime: 60_000,
  });
}

export function usePortalCreditNote(id: string | undefined) {
  return useQuery<PortalCreditNoteDetail>({
    queryKey: ['portal', 'credit-notes', id],
    queryFn: () => fetchAPI(`/api/portal/credit-notes/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}
