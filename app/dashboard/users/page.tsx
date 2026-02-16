import { requireAdmin } from '@/lib/auth/guards';
import UsersClient from './users-client';

export const metadata = {
  title: 'المستخدمون | Pyra Workspace',
};

export default async function UsersPage() {
  await requireAdmin();
  return <UsersClient />;
}
