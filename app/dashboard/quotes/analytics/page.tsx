import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import QuotesAnalyticsClient from './quotes-analytics-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.quotes.analytics');
  return { title: t('meta.title') };
}

export default async function QuotesAnalyticsPage() {
  await requirePermission('quotes.view');
  return <QuotesAnalyticsClient />;
}
