import { requireAuth } from '@/lib/auth/guards';
import MyTasksClient from './my-tasks-client';

export default async function MyTasksPage() {
  const session = await requireAuth();
  return <MyTasksClient session={session} />;
}
