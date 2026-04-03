'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Board {
  id: string;
  name?: string;
  description?: string;
  project_id?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useBoards(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Board[]>({
    queryKey: ['boards', params],
    queryFn: () => fetchAPI(`/api/boards${qs}`),
    staleTime: 60_000,
  });
}

export function useBoard(id: string | undefined) {
  return useQuery<Board>({
    queryKey: ['boards', id],
    queryFn: () => fetchAPI(`/api/boards/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation<Board, Error, Partial<Board>>({
    mutationFn: (data) => mutateAPI('/api/boards', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}

export function useUpdateBoard() {
  const queryClient = useQueryClient();
  return useMutation<Board, Error, { id: string; data: Partial<Board> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/boards/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      queryClient.invalidateQueries({ queryKey: ['boards', id] });
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/boards/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boards'] });
    },
  });
}
