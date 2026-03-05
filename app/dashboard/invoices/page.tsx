import { requirePermission } from '@/lib/auth/guards';
import InvoicesClient from './invoices-client';

export const metadata = {
  title: 'الفواتير | Pyra Workspace',
};

export default async function InvoicesPage() {
  await requirePermission('invoices.view');
  return <InvoicesClient />;
}
