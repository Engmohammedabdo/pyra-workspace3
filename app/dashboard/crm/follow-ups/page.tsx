import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { FollowUpsClient } from './follow-ups-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('crm.followUps');
  return { title: t('meta.title') };
}

export default async function FollowUpsPage() {
  await requirePermission('follow_ups.view');
  return <FollowUpsClient />;
}
