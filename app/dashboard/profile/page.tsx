'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  Activity,
  Globe,
  Monitor,
  Loader2,
  Save,
  Key,
} from 'lucide-react';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';
import { TwoFactorSetup } from '@/components/auth/two-factor-setup';
import { toast } from 'sonner';

interface ProfileData {
  username: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
  activity_count: number;
  login_history: Array<{
    id: string;
    ip_address: string;
    user_agent: string;
    logged_in_at: string;
  }>;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  employee: 'موظف',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ display_name: '', email: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      const json = await res.json();
      if (json.data) {
        setProfile(json.data);
        setForm({
          display_name: json.data.display_name || '',
          email: json.data.email || '',
          phone: json.data.phone || '',
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('فشل في تحميل الملف الشخصي');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      toast.error('الاسم مطلوب');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في الحفظ');
        return;
      }
      toast.success('تم حفظ التغييرات');
      fetchProfile();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!profile) return;
    if (!passwordForm.newPass || passwordForm.newPass.length < 12) {
      toast.error('كلمة المرور يجب أن تكون 12 حرف على الأقل');
      return;
    }
    if (passwordForm.newPass !== passwordForm.confirm) {
      toast.error('كلمة المرور الجديدة وتأكيدها غير متطابقتين');
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch(`/api/users/${profile.username}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordForm.newPass }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في تغيير كلمة المرور');
        return;
      }
      toast.success('تم تغيير كلمة المرور بنجاح');
      setPasswordForm({ current: '', newPass: '', confirm: '' });
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        فشل في تحميل الملف الشخصي
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <User className="h-6 w-6" /> الملف الشخصي
        </h1>
        <p className="text-muted-foreground">إدارة معلوماتك الشخصية</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">المعلومات الشخصية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" /> اسم المستخدم
                </Label>
                <Input value={profile.username} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> الدور
                </Label>
                <Input
                  value={ROLE_LABELS[profile.role] || profile.role}
                  disabled
                  className="bg-muted"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> الاسم الكامل
              </Label>
              <Input
                value={form.display_name}
                onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
                placeholder="الاسم الكامل"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" /> البريد الإلكتروني
                </Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@example.com"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> رقم الهاتف
                </Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+966 ..."
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 me-2" />
                )}
                حفظ التغييرات
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4" /> تغيير كلمة المرور
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  value={passwordForm.newPass}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, newPass: e.target.value }))}
                  placeholder="12 حرف على الأقل"
                  dir="ltr"
                  minLength={12}
                />
              </div>
              <div className="space-y-2">
                <Label>تأكيد كلمة المرور</Label>
                <Input
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                  placeholder="أعد كتابة كلمة المرور"
                  dir="ltr"
                  minLength={12}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              يجب أن تكون كلمة المرور 12 حرف على الأقل
            </p>
            <div className="flex justify-end">
              <Button
                onClick={handlePasswordChange}
                disabled={changingPassword || !passwordForm.newPass}
                variant="outline"
              >
                {changingPassword ? (
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                ) : (
                  <Key className="h-4 w-4 me-2" />
                )}
                تغيير كلمة المرور
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Side Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Avatar placeholder */}
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-2xl font-bold">
                  {profile.display_name?.[0]?.toUpperCase() || 'U'}
                </div>
                <h3 className="mt-3 font-semibold text-lg">{profile.display_name}</h3>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
                <Badge className="mt-2" variant="secondary">
                  {ROLE_LABELS[profile.role] || profile.role}
                </Badge>
              </div>

              <div className="border-t pt-4 space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>انضم {formatRelativeDate(profile.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>{profile.activity_count} إجراء</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 2FA Setup */}
          <TwoFactorSetup
            isEnabled={profile.two_factor_enabled}
            onStatusChange={fetchProfile}
          />

          {/* Recent Logins */}
          {profile.login_history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="h-4 w-4" /> آخر تسجيلات الدخول
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.login_history.map((login) => (
                  <div
                    key={login.id}
                    className="flex items-start gap-2 text-xs p-2 rounded-lg bg-muted/50"
                  >
                    <Monitor className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-mono text-[11px]">{login.ip_address}</p>
                      <p className="text-muted-foreground truncate">
                        {formatDate(login.logged_in_at, 'dd/MM/yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
