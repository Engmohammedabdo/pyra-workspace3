'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import { FileWithProject } from '@/components/portal/files/types';

export function usePortalFiles() {
  return useQuery<FileWithProject[]>({
    queryKey: ['portal', 'files'],
    queryFn: () => fetchAPI('/api/portal/files'),
    staleTime: 60_000,
  });
}

export interface BulkDownloadInput {
  folderPath: string[];
}

export function usePortalFilesBulkDownload() {
  return useMutation<Blob, Error, BulkDownloadInput>({
    mutationFn: async ({ folderPath }) => {
      const res = await fetch('/api/portal/files/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.blob();
    },
  });
}
