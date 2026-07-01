import { requirePermission } from '@/lib/auth/guards';
import LeaveBalancesClient from './leave-balances-client';

export const metadata = { title: 'أرصدة الإجازات' };

export default async function Page() {
  await requirePermission('leave.manage');
  return <LeaveBalancesClient />;
}
