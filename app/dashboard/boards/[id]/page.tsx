import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import BoardViewClient from './board-view-client';

export async function generateMetadata() {
  const t = await getTranslations('boards');
  return { title: t('meta.board') };
}

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('boards.view');
  const { id } = await params;
  return <BoardViewClient boardId={id} session={session} />;
}
