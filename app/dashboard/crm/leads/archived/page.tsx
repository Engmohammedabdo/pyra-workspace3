import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { ArchivedLeadsClient } from './archived-leads-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('crm.leadsList.archived');
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function ArchivedLeadsPage() {
  // `leads.view` is the same gate as the pipeline/customers pages. Server-side
  // scope (getLeadScopeFilter) in /api/crm/leads means a sales agent sees only
  // their OWN archived leads; admin sees all.
  await requirePermission('leads.view');
  return <ArchivedLeadsClient />;
}
