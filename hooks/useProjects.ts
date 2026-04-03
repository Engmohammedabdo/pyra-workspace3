'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Project {
  id: string;
  name: string;
  description?: string;
  status?: string;
  client_id?: string;
  budget?: number;
  start_date?: string;
  end_date?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة المشاريع مع فلترة اختيارية */
export function useProjects(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<Project[]>({
    queryKey: ['projects', params],
    queryFn: () => fetchAPI(`/api/projects${qs}`),
    staleTime: 60_000,
  });
}

/** مشروع واحد بالـ ID */
export function useProject(id: string | undefined) {
  return useQuery<Project>({
    queryKey: ['projects', id],
    queryFn: () => fetchAPI(`/api/projects/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ============================================================
// Hooks: Mutations
// ============================================================

/** إنشاء مشروع جديد */
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation<Project, Error, Partial<Project>>({
    mutationFn: (data) => mutateAPI('/api/projects', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** تعديل مشروع موجود */
export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation<Project, Error, { id: string; data: Partial<Project> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/projects/${id}`, 'PUT', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });
}
