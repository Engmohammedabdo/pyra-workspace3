import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import RolesClient from './roles-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('users');
  return { title: t('roles.meta.title') };
}

export default async function RolesPage() {
  await requirePermission('roles.view');
  return <RolesClient />;
}
