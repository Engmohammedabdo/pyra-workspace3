'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getRoleColorClasses, PERMISSION_MODULES } from '@/lib/auth/rbac';
import { formatRelativeDate } from '@/lib/utils/format';
import {
  UserCircle, Shield, Activity, Lock, Camera,
  Phone, Briefcase, Clock, Save, CheckCircle, X
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

interface ProfileClientProps {
  session: AuthSession;
}

export default function ProfileClient({ session }: ProfileClientProps) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('info');

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [bio, setBio] = useState('');

  // Activity state
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('Failed to fetch');
      const { data } = await res.json();
      setProfile(data);
      setDisplayName(data.display_name || '');
      setPhone(data.phone || '');
      setJobTitle(data.job_title || '');
      setBio(data.bio || '');
    } catch {
      toast.error('فشل تحميل الملف الشخصي');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: displayName,
          phone,
          job_title: jobTitle,
          bio,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('تم حفظ التغييرات بنجاح');
      fetchProfile();
    } catch {
      toast.error('فشل حفظ التغييرات');
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      toast.success('تم رفع الصورة بنجاح');
      fetchProfile();
    } catch {
      toast.error('فشل رفع الصورة');
    }
  };

  const fetchActivities = useCallback(async () => {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/activity?username=${session.pyraUser.username}&limit=20`);
      if (res.ok) {
        const { data } = await res.json();
        setActivities(data || []);
      }
    } catch {
      // Silently fail
    } finally {
      setActivitiesLoading(false);
    }
  }, [session.pyraUser.username]);

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-60" />
          </div>
        </div>
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  const initials = (profile?.display_name || session.pyraUser.username || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6 p-6">
      {/* Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-6">
            {/* Avatar with upload overlay */}
            <div className="relative group">
              <Avatar className="h-20 w-20 border-2 border-orange-200 dark:border-orange-800">
                <AvatarImage src={profile?.avatar_url} alt={profile?.display_name} />
                <AvatarFallback className="bg-orange-500/10 text-orange-600 text-xl font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="h-6 w-6 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadAvatar(file);
                  }}
                />
              </label>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{profile?.display_name || session.pyraUser.username}</h1>
              <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                {profile?.job_title && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {profile.job_title}
                  </span>
                )}
                <Badge variant="outline" className={getRoleColorClasses(session.pyraUser.role_color)}>
                  {session.pyraUser.role_name_ar}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>{profile?.email}</span>
                {profile?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {profile.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="info" className="gap-1.5">
            <UserCircle className="h-4 w-4" />
            معلومات شخصية
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5">
            <Lock className="h-4 w-4" />
            الأمان
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Shield className="h-4 w-4" />
            الصلاحيات
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5" onClick={fetchActivities}>
            <Activity className="h-4 w-4" />
            نشاطي
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Personal Info */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">المعلومات الشخصية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">الاسم المعروض</label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="الاسم الكامل" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">رقم الهاتف</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 000 0000" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">المسمى الوظيفي</label>
                  <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="مثال: مصمم جرافيك" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">اسم المستخدم</label>
                  <Input value={session.pyraUser.username} disabled className="bg-muted" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">نبذة تعريفية</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 280))}
                  placeholder="نبذة مختصرة عنك..."
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  maxLength={280}
                />
                <p className="text-xs text-muted-foreground text-end">{bio.length}/280</p>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
                  {saving ? <Clock className="h-4 w-4 animate-spin me-2" /> : <Save className="h-4 w-4 me-2" />}
                  حفظ التغييرات
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Security */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">تغيير كلمة المرور</CardTitle>
            </CardHeader>
            <CardContent>
              <PasswordChangeForm />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Role & Permissions */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">الدور والصلاحيات</CardTitle>
                <Badge variant="outline" className={getRoleColorClasses(session.pyraUser.role_color)}>
                  {session.pyraUser.role_name_ar}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {PERMISSION_MODULES.map((mod) => {
                  const hasAny = mod.permissions.some(p =>
                    session.pyraUser.rolePermissions.includes(p.key) ||
                    session.pyraUser.rolePermissions.includes('*')
                  );
                  return (
                    <Card key={mod.key} className={`transition-opacity ${hasAny ? '' : 'opacity-40'}`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{mod.labelAr}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-1">
                          {mod.permissions.map((perm) => {
                            const has =
                              session.pyraUser.rolePermissions.includes(perm.key) ||
                              session.pyraUser.rolePermissions.includes('*') ||
                              session.pyraUser.rolePermissions.includes(`${mod.key}.*`);
                            return (
                              <div key={perm.key} className="flex items-center gap-2 text-sm">
                                {has ? (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                ) : (
                                  <X className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                )}
                                <span className={has ? '' : 'text-muted-foreground'}>{perm.labelAr}</span>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                لتغيير صلاحياتك، تواصل مع مسؤول النظام
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: My Activity */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">نشاطي الأخير</CardTitle>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p>لا يوجد نشاط حتى الآن</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activities.map((act: any) => (
                    <div key={act.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                        <Activity className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{act.action_type} — {act.target_path}</p>
                        <p className="text-xs text-muted-foreground">{formatRelativeDate(act.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Password Change Sub-Component ───────────────────────────
function PasswordChangeForm() {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }
    if (newPw.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      toast.success('تم تغيير كلمة المرور بنجاح');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      toast.error(err.message || 'فشل تغيير كلمة المرور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <label className="text-sm font-medium">كلمة المرور الحالية</label>
        <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required dir="ltr" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">كلمة المرور الجديدة</label>
        <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} dir="ltr" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">تأكيد كلمة المرور</label>
        <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required dir="ltr" />
      </div>
      <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
        {saving ? <Clock className="h-4 w-4 animate-spin me-2" /> : <Lock className="h-4 w-4 me-2" />}
        تغيير كلمة المرور
      </Button>
    </form>
  );
}
