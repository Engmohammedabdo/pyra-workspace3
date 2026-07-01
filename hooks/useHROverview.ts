'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface HROverview {
  headcount: {
    active: number;
    by_type: Record<string, number>;
    by_department: Record<string, number>;
    new_30d: number;
    new_90d: number;
    /** Non-active (inactive/suspended) headcount among all non-client users. */
    inactive: number;
    /** Turnover — count of employees whose deactivated_at falls in the last N days. */
    departed_30d: number;
    departed_90d: number;
    departed_365d: number;
  };
  attendance_today: { present: number; absent: number; late: number; on_leave: number; present_rate_pct: number };
  leave: {
    pending: number;
    on_leave_today: Array<{ username: string; display_name: string; end_date: string }>;
    /** Total remaining paid-leave days across all currencies (backward-compat). */
    paid_liability_days: number;
    /**
     * Monetary leave liability grouped by currency — never sum across
     * currencies (mirrors payroll's trend_by_currency pattern).
     */
    liability_by_currency: Array<{ currency: string; amount: number; days: number }>;
    upcoming: Array<{ username: string; display_name: string; start_date: string; end_date: string; days: number }>;
  };
  /** Combined cross-module pending-approvals breakdown. */
  pending_approvals: { leave: number; expense: number; timesheet: number; total: number };
  payroll: {
    current_status: string | null;
    current_month: number;
    current_year: number;
    last_paid_total: number;
    /** ISO-4217 currency code of the most recently paid run (e.g. 'AED', 'EGP'). */
    last_paid_currency: string;
    /**
     * Payroll-cost trend grouped by currency — one independent series per
     * currency so the chart never plots AED and EGP on a shared axis.
     */
    trend_by_currency: Array<{ currency: string; points: Array<{ label: string; total: number }> }>;
    pending_payments_count: number;
  };
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
