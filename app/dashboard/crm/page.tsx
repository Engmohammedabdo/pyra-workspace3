import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { DashboardClient } from './dashboard-client';

export const metadata: Metadata = {
  title: 'لوحة المبيعات — Pyra',
  description: 'CRM Sales Dashboard',
};

export default async function CrmDashboardPage() {
  await requirePermission('crm_reports.view');
  return <DashboardClient />;
}
