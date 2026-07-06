import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import ContractsClient from './contracts-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.contracts');
  return { title: t('meta.title') };
}

export default async function ContractsPage() {
  await requirePermission('finance.view');
  return <ContractsClient />;
}
