'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface PurchaseOrder {
  id: string;
  supplier_id?: string;
  status?: string;
  total?: number;
  order_date?: string;
  delivery_date?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function usePurchaseOrders(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<PurchaseOrder[]>({
    queryKey: ['purchase-orders', params],
    queryFn: () => fetchAPI(`/api/purchase-orders${qs}`),
    staleTime: 60_000,
  });
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery<PurchaseOrder>({
    queryKey: ['purchase-orders', id],
    queryFn: () => fetchAPI(`/api/purchase-orders/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<PurchaseOrder, Error, Partial<PurchaseOrder>>({
    mutationFn: (data) => mutateAPI('/api/purchase-orders', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<PurchaseOrder, Error, { id: string; data: Partial<PurchaseOrder> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/purchase-orders/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', id] });
    },
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/purchase-orders/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}
