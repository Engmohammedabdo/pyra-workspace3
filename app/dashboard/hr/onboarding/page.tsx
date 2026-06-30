import { requirePermission } from '@/lib/auth/guards';
import OnboardingClient from './onboarding-client';

export const metadata = { title: 'تعيين موظفين جدد' };

export default async function OnboardingPage() {
  await requirePermission('hr.manage');
  return <OnboardingClient />;
}
