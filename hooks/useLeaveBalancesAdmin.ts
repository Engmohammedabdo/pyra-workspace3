'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';
import type { EmployeeLeaveBalances } from '@/app/api/hr/leave-balances/route';

export type { EmployeeLeaveBalances, LeaveBalanceTypeEntry } from '@/app/api/hr/leave-balances/route';

export interface AdjustLeaveBalanceInput {
  username: string;
  year: number;
  leave_type_id: string;
  total_days: number;
  used_days: number;
  carried_over: number;
}

const KEY = ['leave-balances-admin'];

/**
 * Admin leave-balances table for a given year (defaults to current Dubai
 * year server-side when omitted). Every active employee × active leave
 * type appears — zero-filled when no v2 row exists yet.
 */
export function useLeaveBalancesAdmin(year?: number) {
  const qs = buildQueryString(year ? { year: String(year) } : undefined);
  return useQuery<EmployeeLeaveBalances[]>({
    queryKey: [...KEY, year],
    queryFn: () => fetchAPI(`/api/hr/leave-balances${qs}`),
    staleTime: 60_000,
  });
}

/** Adjust/upsert one (username, year, leave_type_id) balance row. */
export function useAdjustLeaveBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustLeaveBalanceInput) =>
      mutateAPI('/api/hr/leave-balances', 'POST', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
