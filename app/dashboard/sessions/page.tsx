import { requireAdmin } from '@/lib/auth/guards';
import SessionsClient from './sessions-client';

export const metadata = {
  title: 'الجلسات | Pyra Workspace',
};

export default async function SessionsPage() {
  await requireAdmin();
  return <SessionsClient />;
}
