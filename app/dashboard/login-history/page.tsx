import { requireAdmin } from '@/lib/auth/guards';
import LoginHistoryClient from './login-history-client';

export const metadata = {
  title: 'سجل الدخول | Pyra Workspace',
};

export default async function LoginHistoryPage() {
  await requireAdmin();
  return <LoginHistoryClient />;
}
