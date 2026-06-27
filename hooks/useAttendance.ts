'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface AttendanceRecord {
  id: string;
  username: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number;
  status: 'present' | 'absent' | 'late' | 'early_leave' | 'holiday' | 'weekend';
  notes: string | null;
  ip_address: string | null;
  created_at: string;
  display_name?: string;
}

export interface AttendanceSummary {
  present_days: number;
  late_days: number;
  absent_days: number;
  total_hours: number;
  avg_hours_per_day: number;
  expected_work_days: number;
}

export function useAttendanceRecords(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<AttendanceRecord[]>({
    queryKey: ['attendance-records', params],
    queryFn: () => fetchAPI(`/api/dashboard/attendance${qs}`),
    staleTime: 60_000,
  });
}

export function useAttendanceSummary(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<AttendanceSummary>({
    queryKey: ['attendance-summary', params],
    queryFn: () => fetchAPI(`/api/dashboard/attendance/summary${qs}`),
    staleTime: 60_000,
  });
}

function invalidateAttendance(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['attendance-records'] });
  qc.invalidateQueries({ queryKey: ['attendance-summary'] });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mutateAPI('/api/dashboard/attendance', 'POST', {}),
    onSuccess: () => invalidateAttendance(qc),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mutateAPI('/api/dashboard/attendance/clock-out', 'POST', {}),
    onSuccess: () => invalidateAttendance(qc),
  });
}

export interface UpsertAttendanceInput {
  username: string;
  date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  status: AttendanceRecord['status'];
  notes?: string | null;
}

export function useUpsertAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertAttendanceInput) =>
      mutateAPI('/api/dashboard/attendance/admin', 'POST', input),
    onSuccess: () => invalidateAttendance(qc),
  });
}
