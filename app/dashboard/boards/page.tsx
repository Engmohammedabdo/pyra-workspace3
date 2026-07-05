import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import BoardsClient from './boards-client';

export async function generateMetadata() {
  const t = await getTranslations('boards');
  return { title: t('meta.list') };
}

export default async function BoardsPage() {
  const session = await requirePermission('boards.view');
  return <BoardsClient session={session} />;
}
