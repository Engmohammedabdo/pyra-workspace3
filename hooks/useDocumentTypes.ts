'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraDocumentType } from '@/types/database';

const KEY = ['document-types'];
export function useDocumentTypes() {
  return useQuery<PyraDocumentType[]>({ queryKey: KEY, queryFn: () => fetchAPI('/api/hr/document-types'), staleTime: 300_000 });
}
function inval(qc: ReturnType<typeof useQueryClient>) { qc.invalidateQueries({ queryKey: KEY }); }
export function useCreateDocumentType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: Partial<PyraDocumentType>) => mutateAPI('/api/hr/document-types', 'POST', b), onSuccess: () => inval(qc) });
}
export function useUpdateDocumentType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...b }: { id: string } & Partial<PyraDocumentType>) => mutateAPI(`/api/hr/document-types/${id}`, 'PATCH', b), onSuccess: () => inval(qc) });
}
export function useDeleteDocumentType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => mutateAPI(`/api/hr/document-types/${id}`, 'DELETE'), onSuccess: () => inval(qc) });
}
