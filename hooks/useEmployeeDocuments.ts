'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';
import type { PyraEmployeeDocument } from '@/types/database';

interface DocsResponse { documents: PyraEmployeeDocument[] }
export interface UploadDocInput {
  file: File; employee_username: string; type_id: string;
  label?: string; expiry_date?: string | null; notes?: string;
}

export function useEmployeeDocuments(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<DocsResponse>({ queryKey: ['employee-documents', params],
    queryFn: () => fetchAPI(`/api/hr/documents${qs}`), staleTime: 60_000 });
}
export function useEmployeeDocumentsByUser(username: string | undefined) {
  return useQuery<DocsResponse>({ queryKey: ['employee-documents', { employee_username: username }],
    queryFn: () => fetchAPI(`/api/hr/documents?employee_username=${username}`), enabled: !!username, staleTime: 60_000 });
}
export function useUploadEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation<PyraEmployeeDocument, Error, UploadDocInput>({
    mutationFn: async ({ file, employee_username, type_id, label, expiry_date, notes }) => {
      const form = new FormData();
      form.append('file', file);
      form.append('employee_username', employee_username);
      form.append('type_id', type_id);
      if (label) form.append('label', label);
      if (expiry_date) form.append('expiry_date', expiry_date);
      if (notes) form.append('notes', notes);
      const res = await fetch('/api/hr/documents', { method: 'POST', body: form });
      if (!res.ok) { let m = `Upload failed (${res.status})`; try { const b = await res.json(); if (typeof b?.error === 'string') m = b.error; } catch {} throw new Error(m); }
      return (await res.json()).data.document as PyraEmployeeDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-documents'] }),
  });
}
export function useUpdateEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...patch }: { id: string } & Partial<PyraEmployeeDocument>) =>
    mutateAPI(`/api/hr/documents/${id}`, 'PATCH', patch), onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-documents'] }) });
}
export function useDeleteEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => mutateAPI(`/api/hr/documents/${id}`, 'DELETE'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-documents'] }) });
}
