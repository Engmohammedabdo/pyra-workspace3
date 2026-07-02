import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { ArchivedLeadsClient } from './archived-leads-client';

export const metadata: Metadata = {
  title: 'أرشيف الـ Leads — Pyra',
  description: 'الـ Leads المؤرشفة',
};

export default async function ArchivedLeadsPage() {
  // `leads.view` is the same gate as the pipeline/customers pages. Server-side
  // scope (getLeadScopeFilter) in /api/crm/leads means a sales agent sees only
  // their OWN archived leads; admin sees all.
  await requirePermission('leads.view');
  return <ArchivedLeadsClient />;
}
