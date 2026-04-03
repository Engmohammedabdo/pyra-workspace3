'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

export interface ClientNotification {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
  [key: string]: unknown;
}

export function usePortalNotifications() {
  return useQuery<ClientNotification[]>({
    queryKey: ['portal', 'notifications'],
    queryFn: () => fetchAPI('/api/portal/notifications'),
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/portal/notifications/${id}`, 'PATCH'),
    onSuccess: (_, id) => {
      queryClient.setQueryData<ClientNotification[]>(['portal', 'notifications'], (prev) =>
        prev ? prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)) : prev
      );
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: () => mutateAPI('/api/portal/notifications', 'PATCH'),
    onSuccess: () => {
      queryClient.setQueryData<ClientNotification[]>(['portal', 'notifications'], (prev) =>
        prev ? prev.map((n) => ({ ...n, is_read: true })) : prev
      );
    },
  });
}
