'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface Subscription {
  id: string;
  client_id?: string;
  plan?: string;
  status?: string;
  amount?: number;
  billing_cycle?: string;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useSubscriptions(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Subscription[]>({
    queryKey: ['subscriptions', params],
    queryFn: () => fetchAPI(`/api/finance/subscriptions${qs}`),
    staleTime: 60_000,
  });
}

export function useSubscription(id: string | undefined) {
  return useQuery<Subscription>({
    queryKey: ['subscriptions', id],
    queryFn: () => fetchAPI(`/api/finance/subscriptions/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();
  return useMutation<Subscription, Error, Partial<Subscription>>({
    mutationFn: (data) => mutateAPI('/api/finance/subscriptions', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();
  return useMutation<Subscription, Error, { id: string; data: Partial<Subscription> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/finance/subscriptions/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions', id] });
    },
  });
}

export function useDeleteSubscription() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/finance/subscriptions/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}
