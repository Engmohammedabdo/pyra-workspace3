import { requireAuth } from '@/lib/auth/guards';
import ActivityClient from './activity-client';

export const metadata = {
  title: 'سجل النشاط | Pyra Workspace',
};

export default async function ActivityPage() {
  await requireAuth();
  return <ActivityClient />;
}
