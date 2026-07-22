import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { DeductionsClient } from './deductions-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.deductions.admin.meta');
  return { title: t('title') };
}

export default async function DeductionsPage() {
  await requirePermission('hr.manage');
  return <DeductionsClient />;
}
