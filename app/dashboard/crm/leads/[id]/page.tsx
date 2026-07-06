import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { LeadDetailClient } from './lead-detail-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('crm.lead');
  return { title: t('meta.title') };
}

export default async function CrmLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('leads.view');
  const { id } = await params;
  return <LeadDetailClient leadId={id} />;
}
