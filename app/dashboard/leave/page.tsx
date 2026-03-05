import { requirePermission } from '@/lib/auth/guards';
import LeaveClient from './leave-client';

export default async function LeavePage() {
  const session = await requirePermission('leave.view');
  return <LeaveClient session={session} />;
}
