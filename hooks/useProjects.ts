'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  client_id: string | null;
  team_id: string | null;
  budget: number | null;
  budgeted_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  storage_path: string | null;
  cover_image: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
    mutationFn: ({ id, data }) => mutateAPI(`/api/projects/${id}`, 'PATCH', data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
    },
  });
}
