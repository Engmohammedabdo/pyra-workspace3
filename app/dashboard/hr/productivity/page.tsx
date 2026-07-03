import { requirePermission } from '@/lib/auth/guards';
import { ProductivityClient } from './productivity-client';

export const metadata = { title: 'تقرير الإنتاجية | Pyra Workspace' };

export default async function ProductivityPage() {
  await requirePermission('hr.view');
  return <ProductivityClient />;
}
