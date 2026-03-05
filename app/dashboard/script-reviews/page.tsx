import { requirePermission } from '@/lib/auth/guards';
import ScriptReviewsClient from './script-reviews-client';

export const metadata = {
  title: 'مراجعة السكريبتات | Pyra',
};

export default async function ScriptReviewsPage() {
  await requirePermission('script_reviews.view');
  return <ScriptReviewsClient />;
}
