import { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import ApprovalsClient from './approvals-client';

export const metadata: Metadata = {
  title: 'الموافقات | Pyra Workspace',
  description: 'موافقات الإجازات والمصاريف وساعات العمل لفريقك',
};

export default async function ApprovalsPage() {
  await requirePermission('leave.approve');
  return <ApprovalsClient />;
}
