import { requirePermission } from '@/lib/auth/guards';
import AttendanceClient from './attendance-client';

export default async function AttendancePage() {
  const session = await requirePermission('attendance.view');
  return <AttendanceClient session={session} />;
}
