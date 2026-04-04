'use client';

import { useState } from 'react';
import { mutateAPI } from '@/hooks/api-helpers';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form-label';
import { Label } from '@/components/ui/label';
import { User, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProfileFormProps {
  initialData: { name: string; email: string; phone: string | null; company: string };
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const [name, setName] = useState(initialData.name);
  const [email, setEmail] = useState(initialData.email);
  const [phone, setPhone] = useState(initialData.phone ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await mutateAPI('/api/portal/profile', 'PATCH', { name: name.trim(), email: email.trim(), phone: phone.trim() || null });
      toast.success('تم حفظ البيانات بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء حفظ البيانات');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-portal/10 flex items-center justify-center">
            <User className="h-5 w-5 text-portal" />
          </div>
          <div>
            <CardTitle className="text-base">البيانات الشخصية</CardTitle>
            <CardDescription>تعديل بياناتك الأساسية</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FormLabel htmlFor="profile-name" required>الاسم</FormLabel>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-company">الشركة</Label>
              <Input id="profile-company" value={initialData.company} disabled className="opacity-70 cursor-not-allowed" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FormLabel htmlFor="profile-email" required>البريد الإلكتروني</FormLabel>
              <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" className="text-start" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">رقم الهاتف</Label>
              <Input id="profile-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" className="text-start" />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving} className="gap-2 bg-portal hover:bg-portal-secondary text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التغييرات
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
