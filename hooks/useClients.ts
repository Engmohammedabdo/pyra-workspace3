'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address?: string | null;
  is_active?: boolean;
  auth_user_id?: string | null;
  portal_password_hash?: string | null;
  last_login_at?: string | null;
  source?: string | null;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ClientFinancials {
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  overdue: number;
  invoice_count: number;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة العملاء مع فلترة اختيارية */
export function useClients(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Client[]>({
    queryKey: ['clients', params],
    queryFn: () => fetchAPI(`/api/clients${qs}`),
    staleTime: 60_000, // دقيقة واحدة
  });
}

/** عميل واحد بالـ ID */
export function useClient(id: string | undefined) {
  return useQuery<Client>({
    queryKey: ['clients', id],
    queryFn: () => fetchAPI(`/api/clients/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** البيانات المالية للعميل */
export function useClientFinancials(id: string | undefined) {
  return useQuery<ClientFinancials>({
    queryKey: ['clients', id, 'financials'],
    queryFn: () => fetchAPI(`/api/clients/${id}/financials`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** إنشاء عميل جديد */
export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation<Client, Error, Partial<Client>>({
    mutationFn: (data) => mutateAPI('/api/clients', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

/** تعديل عميل موجود */
export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation<Client, Error, { id: string; data: Partial<Client> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/clients/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', id] });
    },
  });
}
