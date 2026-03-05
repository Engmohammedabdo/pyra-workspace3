import { requirePermission } from '@/lib/auth/guards';
import BoardViewClient from './board-view-client';

export const metadata = {
  title: '\u0644\u0648\u062D\u0629 \u0627\u0644\u0639\u0645\u0644 | Pyra Workspace',
};

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePermission('boards.view');
  const { id } = await params;
  return <BoardViewClient boardId={id} session={session} />;
}
