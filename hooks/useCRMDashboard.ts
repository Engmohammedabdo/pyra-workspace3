'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';
import type { PipelineStageId } from '@/lib/constants/statuses';

// ── Types ──

export type CRMPeriod = 'this_month' | 'last_30d' | 'quarter';

export interface CRMKPIs {
  pipeline_value: { total_aed: number; count: number; trend_pct: number };
  closed_won:     { total_aed: number; count: number; vs_target_pct: number };
  conversion_rate: { current_pct: number; vs_prior_pct: number };
  avg_deal_size:  { aed: number; trend: 'up' | 'down' | 'flat' };
  monthly_recurring_revenue: number;
  forecast_close_value: number;
}

export interface CRMFunnelStage {
  stage_id: PipelineStageId;
  label_ar: string;
  count: number;
  total_value: number;
}

export interface DealAtRisk {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  stage_id: string | null;
  expected_value: number;
  expected_value_currency: string;
  last_contact_at: string | null;
  assigned_to: string | null;
  priority: string | null;
  last_activity_at: string | null;
  days_idle: number | null;
}

export interface TeamPerfAgent {
  username: string;
  display_name: string;
  role: string | null;
  total_leads: number;
  active_leads: number;
  won_count: number;
  lost_count: number;
  pipeline_value: number;
  won_value: number;
  conversion_pct: number;
}

export interface CRMRecentActivity {
  id: string;
  lead_id: string;
  activity_type: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  lead_name: string | null;
  created_by_display_name: string | null;
}

export interface CRMInsight {
  type: 'idle_warning' | 'approvals_pending' | 'overdue_followups';
  severity: 'high' | 'medium' | 'low';
  count: number;
  value?: number;
  message_ar: string;
  link?: string;
}

// ── Queries ──

export function useCRMKPIs(period: CRMPeriod = 'this_month') {
  return useQuery<CRMKPIs>({
    queryKey: ['crm', 'dashboard', 'kpis', period],
    queryFn: () => fetchAPI(`/api/crm/dashboard/kpis?period=${period}`),
    staleTime: 30_000,
  });
}

export function useCRMFunnel() {
  return useQuery<{ stages: CRMFunnelStage[] }>({
    queryKey: ['crm', 'dashboard', 'funnel'],
    queryFn: () => fetchAPI('/api/crm/dashboard/funnel'),
    staleTime: 30_000,
  });
}

export function useDealsAtRisk(days = 7) {
  return useQuery<{ deals_at_risk: DealAtRisk[]; days_threshold: number }>({
    queryKey: ['crm', 'dashboard', 'deals-at-risk', days],
    queryFn: () => fetchAPI(`/api/crm/dashboard/deals-at-risk?days=${days}`),
    staleTime: 60_000,
  });
}

export function useTeamPerformance() {
  return useQuery<{ team: TeamPerfAgent[] }>({
    queryKey: ['crm', 'dashboard', 'team-performance'],
    queryFn: () => fetchAPI('/api/crm/dashboard/team-performance'),
    staleTime: 60_000,
  });
}

export function useCRMRecentActivity(limit = 20) {
  return useQuery<{ activities: CRMRecentActivity[] }>({
    queryKey: ['crm', 'dashboard', 'recent-activity', limit],
    queryFn: () => fetchAPI(`/api/crm/dashboard/recent-activity?limit=${limit}`),
    staleTime: 30_000,
  });
}

export function useCRMInsights() {
  return useQuery<{ insights: CRMInsight[] }>({
    queryKey: ['crm', 'dashboard', 'ai-insights'],
    queryFn: () => fetchAPI('/api/crm/dashboard/ai-insights'),
    staleTime: 60_000,
  });
}
