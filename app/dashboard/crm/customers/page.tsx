import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { CustomersListClient } from './customers-list-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('crm.customers.list');
  return { title: t('meta.title'), description: t('meta.description') };
}

export default async function CrmCustomersListPage() {
  // `leads.view` is the same gate as the lead-detail / pipeline pages.
  // Sales agents see only their own converted leads via getLeadScopeFilter()
  // applied server-side in the underlying /api/crm/leads endpoint
  // (`is_converted=true` query param + scope filter intersect).
  await requirePermission('leads.view');
  return <CustomersListClient />;
}
