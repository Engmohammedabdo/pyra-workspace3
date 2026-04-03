'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Invoice {
  id: string;
  invoice_number?: string;
  client_id?: string;
  project_id?: string;
  status?: string;
  amount?: number;
  due_date?: string;
  issued_date?: string;
  paid_date?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface RevenueSummary {
  total_revenue?: number;
  paid?: number;
  pending?: number;
  overdue?: number;
  monthly?: Array<{ month: string; amount: number }>;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة الفواتير مع فلترة اختيارية */
export function useInvoices(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Invoice[]>({
    queryKey: ['invoices', params],
    queryFn: () => fetchAPI(`/api/invoices${qs}`),
    staleTime: 30_000,
  });
}

/** فاتورة واحدة بالـ ID */
export function useInvoice(id: string | undefined) {
  return useQuery<Invoice>({
    queryKey: ['invoices', id],
    queryFn: () => fetchAPI(`/api/invoices/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

/** ملخص الإيرادات */
export function useRevenueSummary() {
  return useQuery<RevenueSummary>({
    queryKey: ['invoices', 'revenue-summary'],
    queryFn: () => fetchAPI('/api/invoices/revenue-summary'),
    staleTime: 60_000,
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** إنشاء فاتورة جديدة */
export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation<Invoice, Error, Partial<Invoice>>({
    mutationFn: (data) => mutateAPI('/api/invoices', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

/** تعديل فاتورة موجودة */
export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation<Invoice, Error, { id: string; data: Partial<Invoice> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/invoices/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', id] });
    },
  });
}
