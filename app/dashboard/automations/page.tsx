import { requirePermission } from '@/lib/auth/guards';
import AutomationsClient from './automations-client';

export const metadata = {
  title: 'الأتمتة | Pyra',
};

export default async function AutomationsPage() {
  await requirePermission('automations.view');
  return <AutomationsClient />;
}
