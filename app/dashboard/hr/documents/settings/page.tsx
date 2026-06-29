import { requirePermission } from '@/lib/auth/guards';
import DocumentTypesClient from './document-types-client';

export const metadata = { title: 'أنواع الوثائق' };

export default async function Page() {
  await requirePermission('documents.manage');
  return <DocumentTypesClient />;
}
