import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { PipelineClient } from './pipeline-client';

export const metadata: Metadata = {
  title: 'خط المبيعات — Pyra',
  description: 'CRM Pipeline (Kanban)',
};

export default async function PipelinePage() {
  await requirePermission('leads.view');
  return <PipelineClient />;
}
