import { requirePermission } from '@/lib/auth/guards';
import ContractsClient from './contracts-client';

export const metadata = {
  title: 'العقود | Pyra',
};

export default async function ContractsPage() {
  await requirePermission('finance.view');
  return <ContractsClient />;
}
