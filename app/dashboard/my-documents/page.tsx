import { requirePermission } from '@/lib/auth/guards';
import MyDocumentsClient from './my-documents-client';

export const metadata = { title: 'وثائقي' };

export default async function MyDocumentsPage() {
  await requirePermission('documents.view');
  return <MyDocumentsClient />;
}
