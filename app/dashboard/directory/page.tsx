import { requirePermission } from '@/lib/auth/guards';
import DirectoryClient from './directory-client';

export default async function DirectoryPage() {
  const session = await requirePermission('directory.view');
  return <DirectoryClient session={session} />;
}
