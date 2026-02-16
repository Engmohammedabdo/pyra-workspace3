'use client';

import { useQuery } from '@tanstack/react-query';
import type { UserPermissions } from '@/types/database';

interface CurrentUser {
  username: string;
  role: 'admin' | 'employee';
  display_name: string;
  permissions: UserPermissions;
}

// ============================================================
// Hook: Get current authenticated user's profile
// ============================================================
export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        throw new Error('فشل في جلب بيانات المستخدم');
      }
      const json = await res.json();
      return json.data as CurrentUser;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}
