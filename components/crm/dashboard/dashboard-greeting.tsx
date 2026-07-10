'use client';

/**
 * Time-of-day greeting + user display name at the top of the Sales Dashboard.
 *
 * Per CRM Phase 8 spec (Cluster 1): simple, no data-fetching beyond
 * `useCurrentUser()` for the user's display name. Greeting computed client-side
 * so the cutover from the morning to the evening greeting (see
 * `crm.dashboard.greeting.morning`/`.evening`) follows the user's local
 * clock, not the server's timezone.
 */

import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardGreeting() {
  const t = useTranslations('crm.dashboard.greeting');
  const { data: user, isLoading } = useCurrentUser();
  const hour = new Date().getHours();
  // Two-mode greeting — natural for the locale.
  // Morning: 4am–11:59am | Afternoon/Evening: 12pm onward
  const greeting = hour < 12 ? t('morning') : t('evening');

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  const name = user?.display_name?.trim() || t('nameFallback');

  return (
    <div>
      <h1 className="text-2xl md:text-[27px] font-extrabold tracking-tight leading-tight">
        {t('line', { greeting, name })} <span aria-hidden>👋</span>
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {hour < 12
          ? t('subtitleMorning')
          : hour < 18
            ? t('subtitleAfternoon')
            : t('subtitleEvening')}
      </p>
    </div>
  );
}
