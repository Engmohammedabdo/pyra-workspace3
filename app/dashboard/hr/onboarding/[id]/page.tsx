import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import OnboardingDetailClient from './onboarding-detail-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.onboarding.detail');
  return { title: t('metaTitle') };
}

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('hr.manage');
  const { id } = await params;
  return <OnboardingDetailClient id={id} />;
}
