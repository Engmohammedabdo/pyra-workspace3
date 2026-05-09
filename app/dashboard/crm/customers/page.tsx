import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { CustomersListClient } from './customers-list-client';

export const metadata: Metadata = {
  title: 'العملاء — Pyra',
  description: 'قائمة العملاء المحوّلين من CRM',
};

export default async function CrmCustomersListPage() {
  // `leads.view` is the same gate as the lead-detail / pipeline pages.
  // Sales agents see only their own converted leads via getLeadScopeFilter()
  // applied server-side in the underlying /api/crm/leads endpoint
  // (`is_converted=true` query param + scope filter intersect).
  await requirePermission('leads.view');
  return <CustomersListClient />;
}
