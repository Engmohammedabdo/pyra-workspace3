'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Role {
  id: string;
  name?: string;
  description?: string;
  permissions?: string[];
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useRoles(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Role[]>({
    queryKey: ['roles', params],
    queryFn: () => fetchAPI(`/api/roles${qs}`),
    staleTime: 60_000,
  });
}

export function useRole(id: string | undefined) {
  return useQuery<Role>({
    queryKey: ['roles', id],
    queryFn: () => fetchAPI(`/api/roles/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, Partial<Role>>({
    mutationFn: (data) => mutateAPI('/api/roles', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useUpdateRole() {
  const queryClient = useQueryClient();
  return useMutation<Role, Error, { id: string; data: Partial<Role> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/roles/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles', id] });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/roles/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}
