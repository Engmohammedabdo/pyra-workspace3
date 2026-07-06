import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { ProductivityClient } from './productivity-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.productivity.meta');
  return { title: t('title') };
}

export default async function ProductivityPage() {
  await requirePermission('hr.view');
  return <ProductivityClient />;
}
