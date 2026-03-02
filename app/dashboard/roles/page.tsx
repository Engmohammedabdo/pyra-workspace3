import { requirePermission } from '@/lib/auth/guards';
import RolesClient from './roles-client';

export const metadata = {
  title: 'الأدوار | Pyra Workspace',
};

export default async function RolesPage() {
  await requirePermission('roles.view');
  return <RolesClient />;
}
