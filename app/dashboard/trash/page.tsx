import { requirePermission } from '@/lib/auth/guards';
import TrashClient from './trash-client';

export const metadata = {
  title: 'المحذوفات | Pyra Workspace',
};

export default async function TrashPage() {
  await requirePermission('trash.view');
  return <TrashClient />;
}
