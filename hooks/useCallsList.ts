import { useQuery } from '@tanstack/react-query';
import { fetchAPI, buildQueryString } from '@/hooks/api-helpers';

/**
 * CRM per-call table — GET /api/crm/calls (V1.1-A). Row-level companion to
 * useCallsReport's per-agent aggregates: one row per synced call, paginated
 * 50/page, filterable by direction / match status / agent.
 */
export interface CallsListCall {
  id: string;
  agent_username: string;
  agent_display_name: string;
  phone: string;
  direction: 'outgoing' | 'incoming' | 'missed';
  duration_seconds: number;
  called_at: string;
  match_status: 'matched' | 'unmatched' | 'ignored';
  lead_id: string | null;
  lead_name: string | null;
}

export interface CallsListResponse {
  calls: CallsListCall[];
  page: number;
  page_size: number;
  total: number;
  scope: 'all' | 'own';
}

export interface CallsListParams {
  month: string;
  page: number;
  agent?: string;
  direction?: string;
  status?: string;
}

export function useCallsList(params: CallsListParams) {
  const qs = buildQueryString({
    month: params.month,
    page: String(params.page),
    agent: params.agent,
    direction: params.direction,
    status: params.status,
  });
  return useQuery<CallsListResponse>({
    queryKey: ['calls-list', params],
    queryFn: () => fetchAPI(`/api/crm/calls${qs}`),
    staleTime: 60_000,
  });
}
