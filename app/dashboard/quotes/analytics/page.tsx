import { requirePermission } from '@/lib/auth/guards';
import QuotesAnalyticsClient from './quotes-analytics-client';

export const metadata = {
  title: 'تحليلات عروض الأسعار | Pyra Workspace',
};

export default async function QuotesAnalyticsPage() {
  await requirePermission('quotes.view');
  return <QuotesAnalyticsClient />;
}
