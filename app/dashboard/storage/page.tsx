import { requirePermission } from '@/lib/auth/guards';
import StorageClient from './storage-client';

export const metadata = {
  title: 'التخزين | Pyra Workspace',
};

export default async function StoragePage() {
  await requirePermission('files.view');
  return <StorageClient />;
}
