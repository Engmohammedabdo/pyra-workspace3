'use client';

import { useState, useEffect, useCallback } from 'react';

interface SidebarBadges {
  notifications: number;
  overdue_invoices: number;
}

const EMPTY_BADGES: SidebarBadges = { notifications: 0, overdue_invoices: 0 };
const POLL_INTERVAL = 60_000; // 60 seconds

export function useSidebarBadges() {
  const [badges, setBadges] = useState<SidebarBadges>(EMPTY_BADGES);

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/sidebar-badges');
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) {
        setBadges(json.data);
      }
    } catch {
      // Silently fail — badges are non-critical
    }
  }, []);

  useEffect(() => {
    fetchBadges();
    const interval = setInterval(fetchBadges, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchBadges]);

  return badges;
}
