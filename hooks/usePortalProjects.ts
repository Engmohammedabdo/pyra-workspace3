'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'in_progress' | 'review' | 'completed' | 'archived';
  filesCount: number;
  updated_at: string;
  [key: string]: unknown;
}

export function usePortalProjects() {
  return useQuery<PortalProject[]>({
    queryKey: ['portal', 'projects'],
    queryFn: () => fetchAPI('/api/portal/projects'),
    staleTime: 60_000,
  });
}
