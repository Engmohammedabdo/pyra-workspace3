import { requirePermission } from '@/lib/auth/guards';
import LeaveSettingsClient from './leave-settings-client';

export default async function LeaveSettingsPage() {
  await requirePermission('leave.manage');
  return <LeaveSettingsClient />;
}
