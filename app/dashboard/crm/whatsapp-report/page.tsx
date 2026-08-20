import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { WhatsappReportClient } from './whatsapp-report-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('whatsapp-report');
  return { title: t('title') };
}

export default async function WhatsappReportPage() {
  await requirePermission('sales_whatsapp.view');
  return <WhatsappReportClient />;
}
