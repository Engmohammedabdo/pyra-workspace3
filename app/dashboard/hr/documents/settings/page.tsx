import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import DocumentTypesClient from './document-types-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.documents.settings');
  return { title: t('title') };
}

export default async function Page() {
  await requirePermission('documents.manage');
  return <DocumentTypesClient />;
}
