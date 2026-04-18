import { Metadata } from 'next';
import ApprovalsClient from './approvals-client';

export const metadata: Metadata = {
  title: 'الموافقات | Pyra Workspace',
  description: 'موافقات الإجازات والمصاريف وساعات العمل لفريقك',
};

export default function ApprovalsPage() {
  return <ApprovalsClient />;
}
