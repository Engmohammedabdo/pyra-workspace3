'use client';

import { useState } from 'react';
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
// Upload progress state
// ============================================================
export interface UploadProgress {
  /** Total files count */
  totalFiles: number;
  /** Current file index (1-based) */
  currentFile: number;
  /** Current file name */
  currentFileName: string;
  /** Percentage done (0-100) for XMLHttpRequest progress */
  percentage: number;
  /** Overall percentage across all files */
  overallPercentage: number;
}

// ============================================================
// Hook: Upload files with progress tracking (XHR-based)
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

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const currentFile = i + 1;

        setUploadProgress({
          totalFiles,
          currentFile,
          currentFileName: file.name,
          percentage: 0,
          overallPercentage: Math.round((i / totalFiles) * 100),
        });

        try {
          const uploadedPath = await uploadSingleFile(
            file,
            parentPath,
            (pct) => {
              setUploadProgress({
                totalFiles,
                currentFile,
                currentFileName: file.name,
                percentage: pct,
                overallPercentage: Math.round(
                  ((i + pct / 100) / totalFiles) * 100
                ),
              });
            }
          );
          results.push(uploadedPath);
        } catch (err) {
          errors.push(
            `فشل رفع "${file.name}": ${err instanceof Error ? err.message : 'خطأ غير معروف'}`
          );
        }
      }

      setUploadProgress(null);

      if (results.length === 0) {
        throw new Error(errors.join('; ') || 'فشل رفع جميع الملفات');
      }

      return { uploaded: results, errors };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', variables.parentPath] });
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
  const urlRes = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      prefix: parentPath,
    }),
  });

  if (!urlRes.ok) {
    const json = await urlRes.json().catch(() => ({}));
    throw new Error(json.error || `فشل إنشاء رابط الرفع (${urlRes.status})`);
  }

  const { data: urlData } = await urlRes.json();
  const { signedUrl, storagePath, safeName } = urlData as {
    signedUrl: string;
    token: string;
    storagePath: string;
    safeName: string;
  };

  // Step 2 — Upload file directly to Supabase Storage via XHR (for progress)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(`فشل الرفع إلى التخزين (${xhr.status})`)
        );
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('فشل الاتصال بخادم التخزين'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('تم إلغاء الرفع'));
    });

    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });

  // Step 3 — Index the file in the database
  const completeRes = await fetch('/api/files/upload-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storagePath,
      fileName: safeName,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
    }),
  });

  if (!completeRes.ok) {
    const json = await completeRes.json().catch(() => ({}));
    // File is already uploaded to storage — warn but don't fail hard
    console.warn('Upload indexing warning:', json.error);
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
      const res = await fetch('/api/files/move-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePaths, destinationFolder }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'فشل في نقل الملفات');
      }

      return res.json();
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
