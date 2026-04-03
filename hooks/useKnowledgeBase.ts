'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface KnowledgeBaseArticle {
  id: string;
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useKnowledgeBase(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<KnowledgeBaseArticle[]>({
    queryKey: ['knowledge-base', params],
    queryFn: () => fetchAPI(`/api/knowledge-base${qs}`),
    staleTime: 60_000,
  });
}

export function useKnowledgeBaseArticle(id: string | undefined) {
  return useQuery<KnowledgeBaseArticle>({
    queryKey: ['knowledge-base', id],
    queryFn: () => fetchAPI(`/api/knowledge-base/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateKnowledgeBaseArticle() {
  const queryClient = useQueryClient();
  return useMutation<KnowledgeBaseArticle, Error, Partial<KnowledgeBaseArticle>>({
    mutationFn: (data) => mutateAPI('/api/knowledge-base', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    },
  });
}

export function useUpdateKnowledgeBaseArticle() {
  const queryClient = useQueryClient();
  return useMutation<KnowledgeBaseArticle, Error, { id: string; data: Partial<KnowledgeBaseArticle> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/knowledge-base/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', id] });
    },
  });
}

export function useDeleteKnowledgeBaseArticle() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/knowledge-base/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    },
  });
}
