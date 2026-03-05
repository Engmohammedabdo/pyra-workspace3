import { requirePermission } from '@/lib/auth/guards';
import EvaluationsSettingsClient from './evaluations-settings-client';

export default async function EvaluationsSettingsPage() {
  const session = await requirePermission('evaluations.manage');
  return <EvaluationsSettingsClient session={session} />;
}
