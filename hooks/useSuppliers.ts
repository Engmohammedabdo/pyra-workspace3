'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Supplier {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useSuppliers(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Supplier[]>({
    queryKey: ['suppliers', params],
    queryFn: () => fetchAPI(`/api/suppliers${qs}`),
    staleTime: 60_000,
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery<Supplier>({
    queryKey: ['suppliers', id],
    queryFn: () => fetchAPI(`/api/suppliers/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation<Supplier, Error, Partial<Supplier>>({
    mutationFn: (data) => mutateAPI('/api/suppliers', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation<Supplier, Error, { id: string; data: Partial<Supplier> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/suppliers/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers', id] });
    },
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/suppliers/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });
}
