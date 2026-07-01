import { requirePermission } from '@/lib/auth/guards';
import WorkSchedulesClient from './work-schedules-client';

export const metadata = { title: 'جداول العمل' };

export default async function Page() {
  await requirePermission('attendance.manage');
  return <WorkSchedulesClient />;
}
