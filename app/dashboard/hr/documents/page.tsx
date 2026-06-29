import { requirePermission } from '@/lib/auth/guards';
import DocumentsClient from './documents-client';

export const metadata = { title: 'وثائق الموظفين' };

export default async function DocumentsPage() {
  await requirePermission('documents.manage');
  return <DocumentsClient />;
}
