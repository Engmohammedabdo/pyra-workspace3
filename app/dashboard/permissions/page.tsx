import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import PermissionsClient from './permissions-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('users');
  return { title: t('permissions.meta.title') };
}

export default async function PermissionsPage() {
  await requirePermission('users.manage');
  return <PermissionsClient />;
}
