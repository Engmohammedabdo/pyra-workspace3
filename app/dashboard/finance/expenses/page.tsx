import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import ExpensesClient from './expenses-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('finance.expenses');
  return { title: t('meta.title') };
}

export default async function ExpensesPage() {
  await requirePermission('finance.view');
  return <ExpensesClient />;
}
