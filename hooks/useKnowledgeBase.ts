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
    queryFn: () => fetchAPI(`/api/kb/articles${qs}`),
    staleTime: 60_000,
  });
}

export function useKnowledgeBaseArticle(id: string | undefined) {
  return useQuery<KnowledgeBaseArticle>({
    queryKey: ['knowledge-base', id],
    queryFn: () => fetchAPI(`/api/kb/articles/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateKnowledgeBaseArticle() {
  const queryClient = useQueryClient();
  return useMutation<KnowledgeBaseArticle, Error, Partial<KnowledgeBaseArticle>>({
    mutationFn: (data) => mutateAPI('/api/kb/articles', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    },
  });
}

export function useUpdateKnowledgeBaseArticle() {
  const queryClient = useQueryClient();
  return useMutation<KnowledgeBaseArticle, Error, { id: string; data: Partial<KnowledgeBaseArticle> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/kb/articles/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-base', id] });
    },
  });
}

export function useDeleteKnowledgeBaseArticle() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/kb/articles/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    },
  });
}
