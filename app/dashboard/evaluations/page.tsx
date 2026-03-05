import { requirePermission } from '@/lib/auth/guards';
import EvaluationsClient from './evaluations-client';

export default async function EvaluationsPage() {
  const session = await requirePermission('evaluations.view');
  return <EvaluationsClient session={session} />;
}
