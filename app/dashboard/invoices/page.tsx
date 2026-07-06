import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import InvoicesClient from './invoices-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.invoices');
  return { title: t('meta.title') };
}

export default async function InvoicesPage() {
  await requirePermission('invoices.view');
  return <InvoicesClient />;
}
