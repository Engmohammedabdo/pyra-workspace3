import { requirePermission } from '@/lib/auth/guards';
import KnowledgeBaseClient from './knowledge-base-client';

export const metadata = {
  title: 'قاعدة المعرفة | Pyra',
};

export default async function KnowledgeBasePage() {
  await requirePermission('knowledge_base.view');
  return <KnowledgeBaseClient />;
}
