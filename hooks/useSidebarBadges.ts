'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

interface SidebarBadges {
  notifications: number;
  overdue_invoices: number;
  pending_approvals: number;
  unassigned_conversations: number;
  team_approvals: number;
  follow_ups_pending: number;
  crm_pending_approvals: number;
}

const EMPTY_BADGES: SidebarBadges = {
  notifications: 0,
  overdue_invoices: 0,
  pending_approvals: 0,
  unassigned_conversations: 0,
  team_approvals: 0,
  follow_ups_pending: 0,
  crm_pending_approvals: 0,
};

/**
 * Sidebar badge counts. Polled every 60 seconds; also refetches on window
 * focus so a freshly-decided approval / completed follow-up updates within
 * a tab switch.
 *
 * Mutations elsewhere (e.g. approve / reject / complete-follow-up) can call
 *   qc.invalidateQueries({ queryKey: ['sidebar-badges'] })
 * to refresh the count immediately without waiting for the poll.
 */
export function useSidebarBadges(): SidebarBadges {
  const { data } = useQuery<SidebarBadges>({
    queryKey: ['sidebar-badges'],
    queryFn: () => fetchAPI('/api/dashboard/sidebar-badges'),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return data ?? EMPTY_BADGES;
}
