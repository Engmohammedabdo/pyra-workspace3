'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface RecurringInvoice {
  id: string;
  title: string | null;
  status: string;
  billing_cycle: string;
  next_generation_date: string | null;
  last_generated_at: string | null;
  contract_id: string | null;
  total: number;
  currency: string;
  created_at: string;
  contract_title: string | null;
  project_name: string | null;
  generated_count: number;
  [key: string]: unknown;
}

export function usePortalRecurring() {
  return useQuery<RecurringInvoice[]>({
    queryKey: ['portal', 'recurring-invoices'],
    queryFn: () => fetchAPI('/api/portal/recurring-invoices'),
    staleTime: 60_000,
  });
}
