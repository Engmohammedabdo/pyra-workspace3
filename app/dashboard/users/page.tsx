import { requirePermission } from '@/lib/auth/guards';
import UsersClient from './users-client';

export const metadata = {
  title: 'المستخدمون | Pyra Workspace',
};

export default async function UsersPage() {
  await requirePermission('users.view');
  return <UsersClient />;
}
