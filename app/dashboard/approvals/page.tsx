import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import ApprovalsClient from './approvals-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.approvals.page');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function ApprovalsPage() {
  await requirePermission('leave.approve');
  return <ApprovalsClient />;
}
