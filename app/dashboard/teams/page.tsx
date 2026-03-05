import { requirePermission } from '@/lib/auth/guards';
import TeamsClient from './teams-client';

export const metadata = {
  title: 'الفرق | Pyra Workspace',
};

export default async function TeamsPage() {
  await requirePermission('teams.view');
  return <TeamsClient />;
}
