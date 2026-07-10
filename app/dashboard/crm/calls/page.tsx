import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { CallsClient } from './calls-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('calls');
  return { title: t('title') };
}

export default async function CallsPage() {
  await requirePermission('calls.view');
  return <CallsClient />;
}
