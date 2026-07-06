import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { ApprovalsClient } from './approvals-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('crm.approvals');
  return { title: t('meta.title') };
}

export default async function ApprovalsPage() {
  await requirePermission('leads.approve');
  return <ApprovalsClient />;
}
