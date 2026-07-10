import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';

/**
 * CRM calls report — GET /api/crm/calls/report?month=YYYY-MM (Task 6).
 * Note: `agents` OMITS agents with zero calls in the month — an agent with
 * no calls simply isn't present in the array. Callers must treat
 * `agents.length === 0` as the empty state, never assume a fixed roster.
 */
export interface CallsReportAgent {
  username: string;
  display_name: string;
  today: number;
  month: number;
  outgoing: number;
  incoming: number;
  missed: number;
  matched: number;
  unmatched: number;
  ignored: number;
  total_duration_seconds: number;
  avg_duration_seconds: number;
}

export interface CallsReport {
  month: string;
  scope: 'all' | 'own';
  agents: CallsReportAgent[];
  per_day: Record<string, number>;
}

export function useCallsReport(month: string) {
  return useQuery<CallsReport>({
    queryKey: ['calls-report', month],
    queryFn: () => fetchAPI(`/api/crm/calls/report?month=${month}`),
    staleTime: 60_000,
  });
}
