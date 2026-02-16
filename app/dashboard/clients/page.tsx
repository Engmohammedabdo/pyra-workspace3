import { requireAdmin } from '@/lib/auth/guards';
import ClientsClient from './clients-client';

export const metadata = {
  title: 'العملاء | Pyra Workspace',
};

export default async function ClientsPage() {
  await requireAdmin();
  return <ClientsClient />;
}
