'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { ProfileForm } from '@/components/portal/profile/ProfileForm';
import { PasswordForm } from '@/components/portal/profile/PasswordForm';
import { usePortalProfile } from '@/hooks/usePortalProfile';

export default function PortalProfilePage() {
  const { data: profile, isLoading: loading } = usePortalProfile();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 mt-2" />
        <Skeleton className="h-80 w-full max-w-2xl rounded-xl" />
        <Skeleton className="h-64 w-full max-w-2xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">الملف الشخصي</h1>
        <p className="text-muted-foreground text-sm mt-1">إدارة بيانات حسابك وإعداداتك الشخصية</p>
      </div>
      {profile && <ProfileForm initialData={profile} />}
      <PasswordForm />
    </div>
  );
}
