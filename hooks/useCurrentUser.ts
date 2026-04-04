'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import type { UserPermissions } from '@/types/database';

interface CurrentUser {
  username: string;
  role: string;
  role_id: string | null;
  display_name: string;
  permissions: UserPermissions;
  rolePermissions: string[];
  role_name_ar: string;
  role_color: string;
  role_icon: string;
}

// ============================================================
// Hook: Get current authenticated user's profile
// ============================================================
export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ['currentUser'],
    queryFn: () => fetchAPI<CurrentUser>('/api/auth/me'),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
