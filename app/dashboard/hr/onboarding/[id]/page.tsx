import { requirePermission } from '@/lib/auth/guards';
import OnboardingDetailClient from './onboarding-detail-client';

export const metadata = { title: 'تفاصيل التعيين' };

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('hr.manage');
  const { id } = await params;
  return <OnboardingDetailClient id={id} />;
}
