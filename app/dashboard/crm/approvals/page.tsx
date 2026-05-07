import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { ApprovalsClient } from './approvals-client';

export const metadata: Metadata = {
  title: 'اعتمادات تنتظرك — Pyra',
};

export default async function ApprovalsPage() {
  await requirePermission('leads.approve');
  return <ApprovalsClient />;
}
