import { requirePermission } from '@/lib/auth/guards';
import PermissionsClient from './permissions-client';

export const metadata = {
  title: 'الصلاحيات | Pyra Workspace',
};

export default async function PermissionsPage() {
  await requirePermission('users.manage');
  return <PermissionsClient />;
}
