import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import SettingsClient from './settings-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('meta.title') };
}

export default async function SettingsPage() {
  await requirePermission('settings.view');
  return <SettingsClient />;
}
