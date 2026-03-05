import { requirePermission } from '@/lib/auth/guards';
import NotificationsClient from './notifications-client';

export const metadata = {
  title: 'الإشعارات | Pyra',
};

export default async function NotificationsPage() {
  await requirePermission('notifications.view');
  return <NotificationsClient />;
}
