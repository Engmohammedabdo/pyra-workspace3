'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

export interface SalesLead {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  source?: string;
  value?: number;
  assigned_to?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export function useSalesLeads(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<SalesLead[]>({
    queryKey: ['sales-leads', params],
    queryFn: () => fetchAPI(`/api/sales/leads${qs}`),
    staleTime: 60_000,
  });
}

export function useSalesLead(id: string | undefined) {
  return useQuery<SalesLead>({
    queryKey: ['sales-leads', id],
    queryFn: () => fetchAPI(`/api/sales/leads/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCreateSalesLead() {
  const queryClient = useQueryClient();
  return useMutation<SalesLead, Error, Partial<SalesLead>>({
    mutationFn: (data) => mutateAPI('/api/sales/leads', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
}

export function useUpdateSalesLead() {
  const queryClient = useQueryClient();
  return useMutation<SalesLead, Error, { id: string; data: Partial<SalesLead> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/sales/leads/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads', id] });
    },
  });
}

export function useDeleteSalesLead() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/sales/leads/${id}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
    },
  });
}
