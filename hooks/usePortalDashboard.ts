'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface PortalDashboardStats {
  activeProjects: number;
  pendingApprovals: number;
  unreadNotifications: number;
  totalFiles: number;
}

export interface PortalDashboardData {
  client?: Record<string, unknown>;
  stats?: PortalDashboardStats;
  financialSummary?: Record<string, unknown>;
  chartData?: unknown;
  projectProgress?: unknown;
  recentActivity?: unknown;
  recentNotifications?: Array<{ id: string; is_read: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

export function usePortalDashboard() {
  return useQuery<PortalDashboardData>({
    queryKey: ['portal', 'dashboard'],
    queryFn: () => fetchAPI('/api/portal/dashboard'),
    staleTime: 60_000,
  });
}
