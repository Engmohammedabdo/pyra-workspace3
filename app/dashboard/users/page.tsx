import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import UsersClient from './users-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('users');
  return { title: t('list.meta.title') };
}

export default async function UsersPage() {
  await requirePermission('users.view');
  return <UsersClient />;
}
