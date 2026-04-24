'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface LeaveRequest {
  id: string;
  employee_id?: string;
  type?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  reason?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useLeaveRequests(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<LeaveRequest[]>({
    queryKey: ['leave', params],
    queryFn: () => fetchAPI(`/api/leave${qs}`),
    staleTime: 60_000,
  });
}

export function useLeaveRequest(id: string | undefined) {
  return useQuery<LeaveRequest>({
    queryKey: ['leave', id],
    queryFn: () => fetchAPI(`/api/leave/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation<LeaveRequest, Error, Partial<LeaveRequest>>({
    mutationFn: (data) => mutateAPI('/api/leave', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
  });
}

export function useUpdateLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation<LeaveRequest, Error, { id: string; data: Partial<LeaveRequest> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/leave/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
      queryClient.invalidateQueries({ queryKey: ['leave', id] });
    },
  });
}

export function useDeleteLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/leave/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave'] });
    },
  });
}
