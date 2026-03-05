import { requirePermission } from '@/lib/auth/guards';
import ReviewsClient from './reviews-client';

export const metadata = {
  title: 'المراجعات | Pyra',
};

export default async function ReviewsPage() {
  await requirePermission('reviews.view');
  return <ReviewsClient />;
}
