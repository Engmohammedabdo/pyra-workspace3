'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

// ============================================================
// Types
// ============================================================
export interface User {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  avatar_url?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface UserLite {
  id: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

// ============================================================
// Hooks: Queries
// ============================================================

/** قائمة المستخدمين الكاملة */
export function useUsers() {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => fetchAPI('/api/users'),
    staleTime: 2 * 60_000, // دقيقتان
  });
}

/** قائمة المستخدمين المختصرة (للـ dropdowns) */
export function useUsersLite() {
  return useQuery<UserLite[]>({
    queryKey: ['users', 'lite'],
    queryFn: () => fetchAPI('/api/users/lite'),
    staleTime: 5 * 60_000, // 5 دقائق — بيانات مختصرة تتغير نادراً
  });
}
