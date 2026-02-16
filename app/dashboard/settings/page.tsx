import { requireAdmin } from '@/lib/auth/guards';
import SettingsClient from './settings-client';

export const metadata = {
  title: 'الإعدادات | Pyra Workspace',
};

export default async function SettingsPage() {
  await requireAdmin();
  return <SettingsClient />;
}
