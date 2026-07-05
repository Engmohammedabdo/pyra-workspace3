import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { CalendarClient } from './calendar-client';

/**
 * Phase 15.1 Commit 5 — /dashboard/calendar
 *
 * Unified read-only view over lead tasks + follow-ups + meetings. Gated by
 * the new `calendar.view` permission (BASE_EMPLOYEE — every internal user
 * has it). Sales agents see their own events; admin sees all.
 *
 * Default view: month (desktop) / agenda (mobile, detected client-side
 * via matchMedia in calendar-client.tsx).
 */
export async function generateMetadata() {
  const t = await getTranslations('calendar');
  return { title: t('meta.title') };
}

export default async function CalendarPage() {
  await requirePermission('calendar.view');
  return <CalendarClient defaultView="month" />;
}
