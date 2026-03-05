import { requirePermission } from '@/lib/auth/guards';
import PayrollClient from './payroll-client';

export default async function PayrollPage() {
  await requirePermission('payroll.manage');
  return <PayrollClient />;
}
