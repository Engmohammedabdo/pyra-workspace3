import { requirePermission } from '@/lib/auth/guards';
import ExpensesClient from './expenses-client';

export const metadata = {
  title: 'المصروفات | Pyra',
};

export default async function ExpensesPage() {
  await requirePermission('finance.view');
  return <ExpensesClient />;
}
