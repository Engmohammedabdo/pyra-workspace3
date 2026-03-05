import { requirePermission } from '@/lib/auth/guards';
import TimesheetClient from './timesheet-client';

export default async function TimesheetPage() {
  const session = await requirePermission('timesheet.view');
  return <TimesheetClient session={session} />;
}
