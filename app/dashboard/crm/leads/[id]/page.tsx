import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { LeadDetailClient } from './lead-detail-client';

export const metadata: Metadata = {
  title: 'تفاصيل العميل المحتمل — Pyra',
};

export default async function CrmLeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('leads.view');
  const { id } = await params;
  return <LeadDetailClient leadId={id} />;
}
