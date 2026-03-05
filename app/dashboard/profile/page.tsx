import { requireAuth } from '@/lib/auth/guards';
import ProfileClient from './profile-client';

export default async function ProfilePage() {
  const session = await requireAuth();
  return <ProfileClient session={session} />;
}
