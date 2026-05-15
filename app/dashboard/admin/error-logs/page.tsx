import { requirePermission } from '@/lib/auth/guards';
import { ErrorLogsClient } from './error-logs-client';

export const metadata = {
  title: 'سجل الأخطاء | Pyra Workspace',
};

// Phase 14.1 Commit 3 — admin error log viewer. Server-side permission
// gate is the authoritative check. requirePermission redirects on failure
// — sales_agents URL-hacking to this path land at /dashboard.
//
// The sidebar separately hides the nav entry for users without
// `error_logs.view`, but defense-in-depth: the gate here is the lock.
export default async function ErrorLogsPage() {
  await requirePermission('error_logs.view');
  return <ErrorLogsClient />;
}
