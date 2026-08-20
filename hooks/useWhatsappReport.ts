import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import type { AgentWaStats } from '@/lib/whatsapp/report';

/**
 * CRM WhatsApp report — GET /api/crm/whatsapp/report?month=YYYY-MM (Task 8).
 * Note: `agents` OMITS agents with zero WhatsApp activity in the month — an
 * agent with no messages simply isn't present in the array. Callers must
 * treat `agents.length === 0` as the empty state, never assume a fixed
 * roster (mirrors `useCallsReport`).
 */
export interface WaReportAgent extends AgentWaStats {
  username: string;
  display_name: string;
}

export interface WaReport {
  month: string;
  scope: 'all' | 'own';
  agents: WaReportAgent[];
  per_day: Record<string, number>;
}

export function useWhatsappReport(month: string) {
  return useQuery<WaReport>({
    queryKey: ['whatsapp-report', month],
    queryFn: () => fetchAPI(`/api/crm/whatsapp/report?month=${month}`),
    staleTime: 60_000,
  });
}
