import { requirePermission } from '@/lib/auth/guards';
import ContentPipelineClient from './content-pipeline-client';

export const metadata = {
  title: 'خط إنتاج المحتوى | Pyra',
};

export default async function ContentPipelinePage() {
  await requirePermission('script_reviews.view');
  return <ContentPipelineClient />;
}
