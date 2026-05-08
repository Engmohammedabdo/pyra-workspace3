'use client';

/**
 * Time-of-day greeting + user display name at the top of the Sales Dashboard.
 *
 * Per CRM Phase 8 spec (Cluster 1): simple, no data-fetching beyond
 * `useCurrentUser()` for the user's display name. Greeting computed client-side
 * so the cutover from "صباح الخير" → "مساء الخير" follows the user's local
 * clock, not the server's timezone.
 */

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Skeleton } from '@/components/ui/skeleton';

function arabicGreeting(hour: number): string {
  // Two-mode Arabic greeting — natural for the locale.
  // Morning: 4am–11:59am | Afternoon/Evening: 12pm onward
  return hour < 12 ? 'صباح الخير' : 'مساء الخير';
}

export function DashboardGreeting() {
  const { data: user, isLoading } = useCurrentUser();
  const hour = new Date().getHours();
  const greeting = arabicGreeting(hour);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const name = user?.display_name?.trim() || 'بك';

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
        {greeting}، {name} <span aria-hidden>👋</span>
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {hour < 12
          ? 'يوم جديد، فرص جديدة'
          : hour < 18
            ? 'نأمل ينتهي يومك بإغلاق صفقة'
            : 'إنجاز اليوم، تخطيط لبكرة'}
      </p>
    </div>
  );
}
