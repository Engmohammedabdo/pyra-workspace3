import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { DashboardClient } from './dashboard-client';

export async function generateMetadata() {
  const t = await getTranslations('crm.dashboard');
  return {
    title: t('meta.title'),
    description: 'CRM Sales Dashboard',
  };
}

export default async function CrmDashboardPage() {
  await requirePermission('crm_reports.view');
  return <DashboardClient />;
}
