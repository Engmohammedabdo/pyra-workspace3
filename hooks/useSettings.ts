'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Settings {
  id?: string;
  company_name?: string;
  company_email?: string;
  company_phone?: string;
  company_address?: string;
  logo_url?: string;
  currency?: string;
  timezone?: string;
  invoice_prefix?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** جلب إعدادات النظام */
export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => fetchAPI('/api/settings'),
    staleTime: 10 * 60_000, // 10 دقائق — الإعدادات تتغير نادراً جداً
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** تحديث الإعدادات */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation<Settings, Error, Partial<Settings>>({
    mutationFn: (data) => mutateAPI('/api/settings', 'PATCH', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
