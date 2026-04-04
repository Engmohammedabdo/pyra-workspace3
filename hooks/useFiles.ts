'use client';

import { useState, useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import type { FileListItem } from '@/types/database';

// ============================================================
// Hook: List files in a directory with infinite scroll pagination
// ============================================================

const FILES_PAGE_SIZE = 100;

interface FilesPage {
  items: FileListItem[];
  nextOffset: number | null;
}

export function useFiles(path: string = '') {
  const infiniteQuery = useInfiniteQuery<FilesPage>({
    queryKey: ['files', path],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
      const params = new URLSearchParams();
      if (cleanPath) params.set('path', cleanPath);
      params.set('limit', String(FILES_PAGE_SIZE));
      params.set('offset', String(offset));

      // Uses fetchAPI for data, but needs meta.hasMore for pagination.
      // fetchAPI returns json.data ?? json, so items come back directly.
      // We fetch meta separately via a full-response helper.
      const res = await fetch(`/api/files?${params.toString()}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      const items = (json.data || []) as FileListItem[];
      const hasMore = json.meta?.hasMore === true;

      return {
        items,
        nextOffset: hasMore ? offset + FILES_PAGE_SIZE : null,
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Flatten all pages into a single array for consumers
  const data = useMemo(() => {
    if (!infiniteQuery.data) return [];
    return infiniteQuery.data.pages.flatMap((page) => page.items);
  }, [infiniteQuery.data]);

  return {
    data,
    isLoading: infiniteQuery.isLoading,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    refetch: infiniteQuery.refetch,
    error: infiniteQuery.error,
    isError: infiniteQuery.isError,
  };
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
      return mutateAPI('/api/files/folders', 'POST', { path: parentPath, name: folderName });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.parentPath] });
    },
  });
}

// ============================================================
// Upload progress state
// ============================================================
export interface UploadProgress {
  /** Total files count */
  totalFiles: number;
  /** Completed files count */
  completedFiles: number;
  /** Currently uploading file names */
  activeFiles: string[];
  /** Overall percentage across all files */
  overallPercentage: number;
}

// Maximum concurrent uploads
const MAX_CONCURRENT_UPLOADS = 3;

// ============================================================
// Hook: Upload files with parallel progress tracking (XHR-based)
// ============================================================
export function useUploadFiles() {
  const queryClient = useQueryClient();
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      parentPath,
      files,
    }: {
      parentPath: string;
      files: File[];
    }) => {
      const totalFiles = files.length;
      const results: string[] = [];
      const errors: string[] = [];

      // Track per-file progress for overall calculation
      const fileProgress = new Map<number, number>();
      const activeFileNames = new Set<string>();

      const updateProgress = () => {
        let totalPct = 0;
        for (const pct of fileProgress.values()) {
          totalPct += pct;
        }
        setUploadProgress({
          totalFiles,
          completedFiles: results.length + errors.length,
          activeFiles: Array.from(activeFileNames),
          overallPercentage: Math.round((totalPct / totalFiles) * 100),
        });
      };

      // Create a queue of file indices
      const queue = files.map((_, i) => i);
      let queueIndex = 0;

      const worker = async () => {
        while (queueIndex < queue.length) {
          const idx = queueIndex++;
          const file = files[idx];

          fileProgress.set(idx, 0);
          activeFileNames.add(file.name);
          updateProgress();

          try {
            // If file has webkitRelativePath (folder upload), preserve directory structure
            let effectivePath = parentPath;
            const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
            if (relativePath && relativePath.includes('/')) {
              // e.g. "myFolder/sub/file.txt" → append "myFolder/sub" to parentPath
              const relativeDir = relativePath.substring(0, relativePath.lastIndexOf('/'));
              effectivePath = parentPath ? `${parentPath}/${relativeDir}` : relativeDir;
            }

            const uploadedPath = await uploadSingleFile(
              file,
              effectivePath,
              (pct) => {
                fileProgress.set(idx, pct / 100);
                updateProgress();
              }
            );
            results.push(uploadedPath);
            fileProgress.set(idx, 1);
          } catch (err) {
            errors.push(
              `فشل رفع "${file.name}": ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
            );
            fileProgress.set(idx, 1);
          } finally {
            activeFileNames.delete(file.name);
            updateProgress();
          }
        }
      };

      // Launch concurrent workers
      const workerCount = Math.min(MAX_CONCURRENT_UPLOADS, totalFiles);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      setUploadProgress(null);

      if (results.length === 0) {
        throw new Error(errors.join('; ') || 'فشل رفع جميع الملفات');
      }

      return { uploaded: results, errors };
    },
    onSuccess: () => {
      // Invalidate all file queries (folder uploads may create new subdirectories)
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: () => {
      setUploadProgress(null);
    },
  });

  return { ...mutation, uploadProgress };
}

/**
 * Upload a single file via direct-to-Supabase signed URL.
 * This bypasses the Next.js body parser entirely, avoiding the
 * "Failed to parse body as FormData" error on large files.
 *
 * Flow:
 *   1. POST /api/files/upload-url → get signed upload URL
 *   2. PUT file directly to Supabase Storage (XHR for progress)
 *   3. POST /api/files/upload-complete → index file in database
 */
async function uploadSingleFile(
  file: File,
  parentPath: string,
  onProgress: (percentage: number) => void
): Promise<string> {
  // Step 1 — Get signed upload URL from our API
  const urlData = await mutateAPI<{
    signedUrl: string;
    token: string;
    storagePath: string;
    safeName: string;
  }>('/api/files/upload-url', 'POST', {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
    prefix: parentPath,
  });

  const { signedUrl, storagePath, safeName } = urlData;

  // Step 2 — Upload file directly to Supabase Storage via XHR (for progress)
  // Event handlers are stored as named functions so they can be cleaned up
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const onProgress_ = (e: ProgressEvent) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };

    const cleanup = () => {
      xhr.upload.removeEventListener('progress', onProgress_);
      xhr.removeEventListener('load', onLoad);
      xhr.removeEventListener('error', onError);
      xhr.removeEventListener('abort', onAbort);
    };

    const onLoad = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(`فشل الرفع إلى التخزين (${xhr.status})`)
        );
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error('فشل الاتصال بخادم التخزين'));
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('تم إلغاء الرفع'));
    };

    xhr.upload.addEventListener('progress', onProgress_);
    xhr.addEventListener('load', onLoad);
    xhr.addEventListener('error', onError);
    xhr.addEventListener('abort', onAbort);

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });

  // Step 3 — Index the file in the database
  try {
    await mutateAPI('/api/files/upload-complete', 'POST', {
      storagePath,
      fileName: safeName,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    });
  } catch (err) {
    // File is already uploaded to storage — warn but don't fail hard
    console.warn('Upload indexing warning:', err instanceof Error ? err.message : err);
  }

  return storagePath;
}

// ============================================================
// Hook: Delete files (via API route)
// ============================================================
export function useDeleteFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paths }: { paths: string[] }) => {
      return mutateAPI('/api/files/delete-batch', 'POST', { paths });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

// ============================================================
// Hook: Move files/folders to a new location (supports batch)
// ============================================================
export function useMoveFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourcePaths,
      destinationFolder,
    }: {
      sourcePaths: string[];
      destinationFolder: string;
    }) => {
      return mutateAPI('/api/files/move-batch', 'POST', { sourcePaths, destinationFolder });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

// Keep legacy single-file hook as alias
export function useMoveFile() {
  const moveBatch = useMoveFiles();

  return {
    ...moveBatch,
    mutate: (
      { sourcePath, destinationFolder }: { sourcePath: string; destinationFolder: string },
      options?: Parameters<typeof moveBatch.mutate>[1]
    ) => {
      moveBatch.mutate(
        { sourcePaths: [sourcePath], destinationFolder },
        options
      );
    },
  };
}

// ============================================================
// Hook: Get download URL for a file (via API proxy route)
// This streams the file through the server — works for small/medium files
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

// ============================================================
// Hook: Get a signed URL pointing directly to Supabase storage
// Best for large files (PDF, video) — avoids server proxy bottleneck
// ============================================================
export function useSignedUrl() {
  return useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const encodedPath = path
        .split('/')
        .map(encodeURIComponent)
        .join('/');
      const result = await fetchAPI<{ url: string }>(`/api/files/${encodedPath}`);
      return result.url;
    },
  });
}
