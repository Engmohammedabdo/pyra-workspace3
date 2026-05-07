import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { FollowUpsClient } from './follow-ups-client';

export const metadata: Metadata = {
  title: 'المتابعات — Pyra',
};

export default async function FollowUpsPage() {
  await requirePermission('follow_ups.view');
  return <FollowUpsClient />;
}
