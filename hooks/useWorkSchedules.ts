'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraWorkSchedule } from '@/types/database';

const KEY = ['work-schedules'];

export function useWorkSchedules() {
  return useQuery<PyraWorkSchedule[]>({
    queryKey: KEY,
    queryFn: () => fetchAPI('/api/dashboard/work-schedules'),
    staleTime: 60_000,
  });
}

function inval(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY });
}

export function useCreateWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Partial<PyraWorkSchedule>) =>
      mutateAPI('/api/dashboard/work-schedules', 'POST', b),
    onSuccess: () => inval(qc),
  });
}

export function useUpdateWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string } & Partial<PyraWorkSchedule>) =>
      mutateAPI(`/api/dashboard/work-schedules/${id}`, 'PATCH', b),
    onSuccess: () => inval(qc),
  });
}

export function useDeleteWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateAPI(`/api/dashboard/work-schedules/${id}`, 'DELETE'),
    onSuccess: () => inval(qc),
  });
}
