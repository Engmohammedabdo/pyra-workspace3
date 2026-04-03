'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ProfileForm } from '@/components/portal/profile/ProfileForm';
import { PasswordForm } from '@/components/portal/profile/PasswordForm';

interface ClientProfile {
  name: string;
  email: string;
  phone: string | null;
  company: string;
}

export default function PortalProfilePage() {
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/portal/profile');
        const json = await res.json();
        if (res.ok && json.data) setProfile(json.data);
      } catch {
        toast.error('فشل في تحميل بيانات الملف الشخصي');
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

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
