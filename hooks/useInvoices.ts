'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
import type { InvoiceStatus } from '@/lib/constants/statuses';

export interface Invoice {
  id: string;
  invoice_number: string;
  quote_id: string | null;
  client_id: string | null;
  project_id: string | null;
  project_name: string | null;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  discount_type: string | null;
  discount_value: number;
  discount_amount: number;
  notes: string | null;
  company_name: string | null;
  company_logo: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  display_client_name: string | null;
  entity_id: string | null;
  license_no: string | null;
  contract_id: string | null;
  milestone_type: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  items?: Array<{ id: string; description: string; quantity: number; rate: number; amount: number }>;
  payments?: Array<{ id: string; amount: number; payment_date: string; method: string; reference: string | null }>;
}

export interface RevenueSummary {
  total_revenue: number;
  paid: number;
  pending: number;
  overdue: number;
  monthly?: Array<{ month: string; amount: number }>;
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

/**
 * قائمة الفواتير مع الترقيم (total من meta).
 * fetchAPI يجرّد الـ meta — الترقيم يحتاج الغلاف الكامل، لذلك يقرأ
 * الاستجابة الخام (الاستثناء الموثّق للحصول على meta).
 * Finance audit 2026-07-02 (F-PAGINATION): total لم يكن يُقرأ أبداً
 * فكانت الفواتير الأقدم من صفحة واحدة غير قابلة للوصول من القائمة.
 */
export function useInvoicesPaged(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<{ invoices: Invoice[]; total: number }>({
    queryKey: ['invoices', 'paged', params],
    queryFn: async () => {
      const res = await fetch(`/api/invoices${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return {
        invoices: (json.data || []) as Invoice[],
        total: Number(json.meta?.total ?? (json.data || []).length),
      };
    },
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
    mutationFn: ({ id, data }) => mutateAPI(`/api/invoices/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', id] });
    },
  });
}
