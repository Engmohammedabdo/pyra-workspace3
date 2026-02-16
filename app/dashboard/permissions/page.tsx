import { requireAdmin } from '@/lib/auth/guards';
import PermissionsClient from './permissions-client';

export const metadata = {
  title: 'الصلاحيات | Pyra Workspace',
};

export default async function PermissionsPage() {
  await requireAdmin();
  return <PermissionsClient />;
}
