import { requirePermission } from '@/lib/auth/guards';
import AnnouncementsClient from './announcements-client';

export default async function AnnouncementsPage() {
  const session = await requirePermission('announcements.view');
  return <AnnouncementsClient session={session} />;
}
