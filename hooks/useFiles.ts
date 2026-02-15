'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { FileListItem, StorageFile } from '@/types/database';
import { joinPath } from '@/lib/utils/path';

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'pyraai-workspace';

// ============================================================
// Transform Supabase StorageFile → our FileListItem
// ============================================================
function transformStorageFile(file: StorageFile, parentPath: string): FileListItem {
  const isFolder = file.id === null;
  return {
    name: file.name,
    path: joinPath(parentPath, file.name),
    isFolder,
    size: file.metadata?.size || 0,
    mimeType: file.metadata?.mimetype || (isFolder ? 'folder' : 'application/octet-stream'),
    updatedAt: file.updated_at || file.created_at || null,
  };
}

// ============================================================
// Hook: List files in a directory
// ============================================================
export function useFiles(path: string = '') {
  const supabase = createBrowserSupabaseClient();

  return useQuery<FileListItem[]>({
    queryKey: ['files', path],
    queryFn: async () => {
      const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');

      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(cleanPath || '', {
          limit: 500,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (error) {
        throw new Error(error.message);
      }

      if (!data) return [];

      // Filter out .emptyFolderPlaceholder files
      const filtered = data.filter(
        (f) => f.name !== '.emptyFolderPlaceholder' && f.name !== '.gitkeep'
      );

      // Transform and sort: folders first, then files
      const items = filtered.map((f) =>
        transformStorageFile(f as StorageFile, cleanPath)
      );

      return items.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name, 'ar');
      });
    },
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });
}

// ============================================================
// Hook: Create folder
// ============================================================
export function useCreateFolder() {
  const supabase = createBrowserSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentPath,
      folderName,
    }: {
      parentPath: string;
      folderName: string;
    }) => {
      const fullPath = joinPath(parentPath, folderName, '.emptyFolderPlaceholder');

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(fullPath, new Uint8Array(0), {
          contentType: 'application/x-empty',
          upsert: false,
        });

      if (error) throw new Error(error.message);
      return { path: joinPath(parentPath, folderName) };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.parentPath] });
    },
  });
}

// ============================================================
// Hook: Upload files
// ============================================================
export function useUploadFiles() {
  const supabase = createBrowserSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      parentPath,
      files,
    }: {
      parentPath: string;
      files: File[];
    }) => {
      const results = await Promise.allSettled(
        files.map(async (file) => {
          const filePath = joinPath(parentPath, file.name);
          const { error } = await supabase.storage
            .from(BUCKET)
            .upload(filePath, file, {
              cacheControl: '3600',
              upsert: true,
            });
          if (error) throw error;
          return filePath;
        })
      );

      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        throw new Error(`فشل رفع ${failed.length} ملف(ات)`);
      }

      return results;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.parentPath] });
    },
  });
}

// ============================================================
// Hook: Delete files
// ============================================================
export function useDeleteFiles() {
  const supabase = createBrowserSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paths }: { paths: string[] }) => {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove(paths);

      if (error) throw new Error(error.message);
      return paths;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

// ============================================================
// Hook: Get public/signed URL for a file
// ============================================================
export function useFileUrl() {
  const supabase = createBrowserSupabaseClient();

  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600); // 1 hour

      if (!data?.signedUrl) throw new Error('فشل إنشاء رابط الملف');
      return data.signedUrl;
    },
  });
}
