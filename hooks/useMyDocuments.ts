'use client';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';
import type { PyraEmployeeDocument } from '@/types/database';
export function useMyDocuments() {
  return useQuery<{ documents: PyraEmployeeDocument[] }>({ queryKey: ['my-documents'],
    queryFn: () => fetchAPI('/api/my-documents'), staleTime: 60_000 });
}
