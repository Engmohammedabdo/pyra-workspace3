'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface PipelineStage {
  id: string;
  name: string;
  name_ar: string;
  color: string;
  sort_order: number;
  is_default: boolean;
}

/**
 * Active CRM pipeline stages (stg_*), sorted by sort_order.
 * Cached aggressively — stages change very rarely.
 */
export function usePipelineStages() {
  return useQuery<PipelineStage[]>({
    queryKey: ['crm', 'pipeline-stages'],
    queryFn: () => fetchAPI('/api/crm/pipeline-stages'),
    staleTime: 5 * 60_000, // 5 min
  });
}
