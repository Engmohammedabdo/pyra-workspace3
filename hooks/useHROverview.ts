'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface HROverview {
  headcount: { active: number; by_type: Record<string, number>; by_department: Record<string, number>; new_30d: number; new_90d: number };
  attendance_today: { present: number; absent: number; late: number; on_leave: number; present_rate_pct: number };
  leave: { pending: number; on_leave_today: Array<{ username: string; display_name: string; end_date: string }>; paid_liability_days: number; upcoming: Array<{ username: string; display_name: string; start_date: string; end_date: string; days: number }> };
  payroll: { current_status: string | null; current_month: number; current_year: number; last_paid_total: number; trend: Array<{ label: string; total: number }>; pending_payments_count: number; pending_payments_sum: number };
  evaluations: { active_period: string | null; pending: number; submitted: number; acknowledged: number };
  alerts: Array<{ id: string; severity: 'critical' | 'high' | 'medium' | 'low'; message: string; href: string }>;
  celebrations: Array<{ username: string; display_name: string; kind: 'birthday' | 'anniversary'; date: string; years?: number }>;
}

export function useHROverview() {
  return useQuery<HROverview>({
    queryKey: ['hr-overview'],
    queryFn: () => fetchAPI('/api/hr/overview'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
