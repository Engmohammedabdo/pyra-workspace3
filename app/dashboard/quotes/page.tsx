import { requirePermission } from '@/lib/auth/guards';
import QuotesClient from './quotes-client';

export const metadata = {
  title: 'عروض الأسعار | Pyra Workspace',
};

export default async function QuotesPage() {
  await requirePermission('quotes.view');
  return <QuotesClient />;
}
