import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import OnboardingClient from './onboarding-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.onboarding.list');
  return { title: t('title') };
}

export default async function OnboardingPage() {
  await requirePermission('hr.manage');
  return <OnboardingClient />;
}
