import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/lib/auth/guards';
import { PipelineClient } from './pipeline-client';

export async function generateMetadata() {
  const t = await getTranslations('crm.pipeline');
  return {
    title: t('meta.title'),
    description: 'CRM Pipeline (Kanban)',
  };
}

export default async function PipelinePage() {
  await requirePermission('leads.view');
  return <PipelineClient />;
}
