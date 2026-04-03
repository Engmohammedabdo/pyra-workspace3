'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface KBCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  [key: string]: unknown;
}

export function usePortalKBCategories() {
  return useQuery<KBCategory[]>({
    queryKey: ['portal', 'kb', 'categories'],
    queryFn: () => fetchAPI('/api/portal/kb/categories'),
    staleTime: 300_000,
  });
}
