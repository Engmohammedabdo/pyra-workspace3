import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import WorkSchedulesClient from './work-schedules-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.workSchedules');
  return { title: t('title') };
}

export default async function Page() {
  await requirePermission('attendance.manage');
  return <WorkSchedulesClient />;
}
