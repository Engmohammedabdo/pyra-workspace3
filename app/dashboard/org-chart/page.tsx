import { requirePermission } from '@/lib/auth/guards';
import OrgChartClient from './org-chart-client';

export default async function OrgChartPage() {
  await requirePermission('directory.view');
  return <OrgChartClient />;
}
