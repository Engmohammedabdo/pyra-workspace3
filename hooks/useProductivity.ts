import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import type { ProductivityReport } from '@/lib/production/report';

export type { ProductivityReport };

export function useProductivityReport(month: string) {
  return useQuery<ProductivityReport>({
    queryKey: ['hr-productivity', month],
    queryFn: () => fetchAPI(`/api/hr/productivity?month=${month}`),
    staleTime: 60_000,
  });
}

export function useMyProductivity() {
  return useQuery<ProductivityReport>({
    queryKey: ['my-productivity'],
    queryFn: () => fetchAPI('/api/my-productivity'),
    staleTime: 60_000,
  });
}
