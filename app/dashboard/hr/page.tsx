import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import HrOverviewClient from './hr-overview-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.overview.meta');
  return { title: t('title') };
}

export default async function HrOverviewPage() {
  await requirePermission('hr.view');
  return <HrOverviewClient />;
}
