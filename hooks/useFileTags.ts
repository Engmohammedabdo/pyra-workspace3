'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface FileTag {
  id: string;
  file_path: string;
  tag_name: string;
  color: string;
  created_by: string;
  created_at: string;
}

// ── Get tags for a specific file ──
export function useFileTags(filePath: string | null) {
  return useQuery<FileTag[]>({
    queryKey: ['file-tags', filePath],
    queryFn: async () => {
      if (!filePath) return [];
      const res = await fetch(`/api/files/tags?file_path=${encodeURIComponent(filePath)}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []) as FileTag[];
    },
    enabled: !!filePath,
    staleTime: 60_000,
  });
}

// ── Get all unique tags in system (for autocomplete) ──
export function useAllTags() {
  return useQuery<{ tag_name: string; color: string }[]>({
    queryKey: ['all-tags'],
    queryFn: async () => {
      const res = await fetch('/api/files/tags?all=true');
      if (!res.ok) return [];
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 120_000,
  });
}

// ── Add tag to file ──
export function useAddTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      filePath,
      tagName,
      color,
    }: {
      filePath: string;
      tagName: string;
      color?: string;
    }) => {
      const res = await fetch('/api/files/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          tag_name: tagName,
          color,
        }),
      });
      if (!res.ok) throw new Error('فشل إضافة الوسم');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['file-tags', variables.filePath] });
      queryClient.invalidateQueries({ queryKey: ['all-tags'] });
      toast.success(`تم إضافة وسم "${variables.tagName}"`);
    },
    onError: () => {
      toast.error('فشل إضافة الوسم');
    },
  });
}

// ── Remove tag from file ──
export function useRemoveTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      filePath,
      tagName,
    }: {
      filePath: string;
      tagName: string;
    }) => {
      const res = await fetch('/api/files/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          tag_name: tagName,
        }),
      });
      if (!res.ok) throw new Error('فشل حذف الوسم');
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['file-tags', variables.filePath] });
      toast.success('تم حذف الوسم');
    },
    onError: () => {
      toast.error('فشل حذف الوسم');
    },
  });
}
