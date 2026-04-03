'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface PortalContract {
  id: string;
  title: string | null;
  project_name: string | null;
  contract_type: string | null;
  total_value: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  retainer_amount: number;
  retainer_cycle: string | null;
  [key: string]: unknown;
}

export function usePortalContracts() {
  return useQuery<PortalContract[]>({
    queryKey: ['portal', 'contracts'],
    queryFn: () => fetchAPI('/api/portal/contracts'),
    staleTime: 60_000,
  });
}
