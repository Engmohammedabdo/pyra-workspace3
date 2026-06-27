import { requirePermission } from '@/lib/auth/guards';
import HrOverviewClient from './hr-overview-client';

export const metadata = { title: 'الموارد البشرية — نظرة عامة' };

export default async function HrOverviewPage() {
  await requirePermission('hr.view');
  return <HrOverviewClient />;
}
