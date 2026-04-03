'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface Team {
  id: string;
  name: string;
  description?: string;
  members?: TeamMember[];
  created_at?: string;
  [key: string]: unknown;
}

export interface TeamMember {
  id: string;
  user_id?: string;
  role?: string;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة الفرق */
export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: () => fetchAPI('/api/teams'),
    staleTime: 5 * 60_000, // 5 دقائق — بيانات تتغير نادراً
  });
}
