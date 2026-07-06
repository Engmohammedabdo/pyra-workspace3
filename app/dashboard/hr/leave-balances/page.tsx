import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import LeaveBalancesClient from './leave-balances-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('hr.leaveBalances');
  return { title: t('pageTitle') };
}

export default async function Page() {
  await requirePermission('leave.manage');
  return <LeaveBalancesClient />;
}
