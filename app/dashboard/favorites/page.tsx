import { requirePermission } from '@/lib/auth/guards';
import FavoritesClient from './favorites-client';

export const metadata = {
  title: 'المفضلة | Pyra Workspace',
};

export default async function FavoritesPage() {
  await requirePermission('files.view');
  return <FavoritesClient />;
}
