import { requirePermission } from '@/lib/auth/guards';
import BoardsClient from './boards-client';

export const metadata = {
  title: '\u0644\u0648\u062D\u0627\u062A \u0627\u0644\u0639\u0645\u0644 | Pyra Workspace',
};

export default async function BoardsPage() {
  const session = await requirePermission('boards.view');
  return <BoardsClient session={session} />;
}
