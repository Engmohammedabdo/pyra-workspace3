'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Evaluation {
  id: string;
  employee_id?: string;
  evaluator_id?: string;
  period?: string;
  score?: number;
  status?: string;
  feedback?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useEvaluations(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Evaluation[]>({
    queryKey: ['evaluations', params],
    queryFn: () => fetchAPI(`/api/dashboard/evaluations${qs}`),
    staleTime: 60_000,
  });
}

export function useEvaluation(id: string | undefined) {
  return useQuery<Evaluation>({
    queryKey: ['evaluations', id],
    queryFn: () => fetchAPI(`/api/dashboard/evaluations/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateEvaluation() {
  const queryClient = useQueryClient();
  return useMutation<Evaluation, Error, Partial<Evaluation>>({
    mutationFn: (data) => mutateAPI('/api/dashboard/evaluations', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}

export function useUpdateEvaluation() {
  const queryClient = useQueryClient();
  return useMutation<Evaluation, Error, { id: string; data: Partial<Evaluation> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/dashboard/evaluations/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['evaluations', id] });
    },
  });
}

export function useDeleteEvaluation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/dashboard/evaluations/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
}
