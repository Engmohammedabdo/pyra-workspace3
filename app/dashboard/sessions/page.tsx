import { requirePermission } from '@/lib/auth/guards';
import SessionsClient from './sessions-client';

export const metadata = {
  title: 'الجلسات | Pyra Workspace',
};

export default async function SessionsPage() {
  await requirePermission('sessions.view');
  return <SessionsClient />;
}
