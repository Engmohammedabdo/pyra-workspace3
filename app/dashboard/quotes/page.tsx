import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import QuotesClient from './quotes-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.quotes.list');
  return { title: t('meta.title') };
}

export default async function QuotesPage() {
  await requirePermission('quotes.view');
  return <QuotesClient />;
}
