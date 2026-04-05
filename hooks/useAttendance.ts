'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI, buildQueryString } from './api-helpers';

export interface AttendanceRecord {
  id: string;
  employee_id?: string;
  date?: string;
  check_in?: string;
  check_out?: string;
  status?: string;
  hours_worked?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useAttendance(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<AttendanceRecord[]>({
    queryKey: ['attendance', params],
    queryFn: () => fetchAPI(`/api/dashboard/attendance${qs}`),
    staleTime: 60_000,
  });
}

export function useAttendanceRecord(id: string | undefined) {
  return useQuery<AttendanceRecord>({
    queryKey: ['attendance', id],
    queryFn: () => fetchAPI(`/api/dashboard/attendance/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}
