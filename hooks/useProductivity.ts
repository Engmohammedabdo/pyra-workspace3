import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import type { ProductivityReport, ProductivityTrends } from '@/lib/production/report';
import { isValidIsoInstant } from '@/lib/production/deadlines';
import { dubaiDayKey } from '@/lib/utils/format';

export type { ProductivityReport, ProductivityTrends };

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function isCurrentProductivityMonth(
  month: string,
  currentInstant = new Date().toISOString(),
): boolean {
  if (!isValidIsoInstant(currentInstant)) return false;
  return dubaiDayKey(new Date(currentInstant)).slice(0, 7) === month;
}

export function useProductivityDeadlineRefetch(
  deadlineAt: string | null | undefined,
  enabled: boolean,
  refetch: () => unknown,
): void {
  useEffect(() => {
    if (!enabled || !deadlineAt || !isValidIsoInstant(deadlineAt)) return;

    const deadlineMs = Date.parse(deadlineAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const remaining = deadlineMs - Date.now() + 1;
      if (remaining <= 0) {
        void refetch();
        return;
      }
      timer = setTimeout(schedule, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [deadlineAt, enabled, refetch]);
}

export function useProductivityReport(month: string) {
  const query = useQuery<ProductivityReport>({
    queryKey: ['hr-productivity', month],
    queryFn: () => fetchAPI(`/api/hr/productivity?month=${month}`),
    staleTime: 60_000,
  });
  useProductivityDeadlineRefetch(
    query.data?.next_open_deadline_at,
    isCurrentProductivityMonth(month),
    query.refetch,
  );
  return query;
}

export function useProductivityTrends(months = 6) {
  return useQuery<ProductivityTrends>({
    queryKey: ['hr-productivity-trends', months],
    queryFn: () => fetchAPI(`/api/hr/productivity/trends?months=${months}`),
    staleTime: 60_000,
  });
}

export function useMyProductivity() {
  const query = useQuery<ProductivityReport>({
    queryKey: ['my-productivity'],
    queryFn: () => fetchAPI('/api/my-productivity'),
    staleTime: 60_000,
  });
  useProductivityDeadlineRefetch(query.data?.next_open_deadline_at, true, query.refetch);
  return query;
}
