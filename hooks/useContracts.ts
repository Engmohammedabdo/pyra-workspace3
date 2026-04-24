'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Contract {
  id: string;
  title?: string;
  client_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  value?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useContracts(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Contract[]>({
    queryKey: ['contracts', params],
    queryFn: () => fetchAPI(`/api/finance/contracts${qs}`),
    staleTime: 60_000,
  });
}

export function useContract(id: string | undefined) {
  return useQuery<Contract>({
    queryKey: ['contracts', id],
    queryFn: () => fetchAPI(`/api/finance/contracts/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();
  return useMutation<Contract, Error, Partial<Contract>>({
    mutationFn: (data) => mutateAPI('/api/finance/contracts', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();
  return useMutation<Contract, Error, { id: string; data: Partial<Contract> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/finance/contracts/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contracts', id] });
    },
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/finance/contracts/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
  });
}
