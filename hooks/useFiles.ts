'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileListItem } from '@/types/database';

// ============================================================
// Hook: List files in a directory (via API route)
// ============================================================
export function useFiles(path: string = '') {
  return useQuery<FileListItem[]>({
    queryKey: ['files', path],
    queryFn: async () => {
      const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
      const params = new URLSearchParams();
      if (cleanPath) params.set('path', cleanPath);

      const res = await fetch(`/api/files?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'فشل في قراءة الملفات');
      }

      const json = await res.json();
      return (json.data || []) as FileListItem[];
    },
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

// ============================================================
// Hook: Create folder (via API route)
// ============================================================
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentPath,
      folderName,
    }: {
      parentPath: string;
      folderName: string;
    }) => {
      const res = await fetch('/api/files/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: parentPath, name: folderName }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'فشل إنشاء المجلد');
      }

      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.parentPath] });
    },
  });
}

// ============================================================
// Hook: Upload files (via API route with FormData)
// ============================================================
export function useUploadFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentPath,
      files,
    }: {
      parentPath: string;
      files: File[];
    }) => {
      const formData = new FormData();
      formData.set('prefix', parentPath);
      for (const file of files) {
        formData.append('files[]', file);
      }

      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'فشل رفع الملفات');
      }

      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.parentPath] });
    },
  });
}

// ============================================================
// Hook: Delete files (via API route)
// ============================================================
export function useDeleteFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paths }: { paths: string[] }) => {
      const res = await fetch('/api/files/delete-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'فشل في الحذف');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

// ============================================================
// Hook: Move a file or folder to a new location (via API route)
// ============================================================
export function useMoveFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourcePath,
      destinationFolder,
    }: {
      sourcePath: string;
      destinationFolder: string;
    }) => {
      // Build new path: destinationFolder/filename
      const fileName = sourcePath.split('/').pop() || '';
      const newPath = destinationFolder ? `${destinationFolder}/${fileName}` : fileName;

      const encodedPath = sourcePath
        .split('/')
        .map(encodeURIComponent)
        .join('/');

      const res = await fetch(`/api/files/${encodedPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', newPath }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'فشل في نقل الملف');
      }

      return res.json();
    },
    onSuccess: () => {
      // Invalidate all file queries to refresh both source and destination
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

// ============================================================
// Hook: Get download URL for a file (via API route)
// ============================================================
export function useFileUrl() {
  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      // Return the API download route URL directly
      const encodedPath = path
        .split('/')
        .map(encodeURIComponent)
        .join('/');
      return `/api/files/download/${encodedPath}`;
    },
  });
}
