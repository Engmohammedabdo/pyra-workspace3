import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import DocumentsClient from './documents-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.documents');
  return { title: t('title') };
}

export default async function DocumentsPage() {
  await requirePermission('documents.manage');
  return <DocumentsClient />;
}
