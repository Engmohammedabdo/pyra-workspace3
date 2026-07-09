import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import MyDocumentsClient from './my-documents-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.myDocuments');
  return { title: t('title') };
}

export default async function MyDocumentsPage() {
  await requirePermission('documents.view');
  return <MyDocumentsClient />;
}
