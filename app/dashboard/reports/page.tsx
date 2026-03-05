import { requirePermission } from '@/lib/auth/guards';
import ReportsClient from './reports-client';

export const metadata = {
  title: 'التقارير | Pyra Workspace',
};

export default async function ReportsPage() {
  await requirePermission('reports.view');
  return <ReportsClient />;
}
