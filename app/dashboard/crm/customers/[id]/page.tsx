import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { CustomerDetailClient } from './customer-detail-client';

export const metadata: Metadata = {
  title: 'تفاصيل العميل — Pyra',
  description: 'الصفحة النشطة لعميل CRM — العقود، المشاريع، الفواتير، صحة العلاقة',
};

export default async function CrmCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Permission gate — `leads.view` is the same gate as the lead-detail
  // route. Sales agents reach this page only via canAccessLead() server-
  // side enforcement inside the dossier endpoint (404 if not own).
  await requirePermission('leads.view');
  const { id } = await params;
  return <CustomerDetailClient leadId={id} />;
}
