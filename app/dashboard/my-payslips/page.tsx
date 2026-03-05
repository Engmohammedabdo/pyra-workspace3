import { requirePermission } from '@/lib/auth/guards';
import MyPayslipsClient from './my-payslips-client';

export default async function MyPayslipsPage() {
  await requirePermission('payroll.view');
  return <MyPayslipsClient />;
}
