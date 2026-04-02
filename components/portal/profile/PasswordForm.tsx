'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormLabel } from '@/components/ui/form-label';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 12) {
      toast.error('كلمة المرور الجديدة يجب أن تكون 12 حرف على الأقل');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('كلمة المرور الجديدة غير متطابقة');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/portal/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (res.ok) {
        toast.success('تم تغيير كلمة المرور بنجاح. سيتم تحويلك لتسجيل الدخول...');
        setTimeout(() => window.location.href = '/portal/login', 1500);
      } else {
        const json = await res.json();
        toast.error(json.error || 'حدث خطأ أثناء تغيير كلمة المرور');
      }
    } catch {
      toast.error('حدث خطأ غير متوقع');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-portal/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-portal" />
          </div>
          <div>
            <CardTitle className="text-base">تغيير كلمة المرور</CardTitle>
            <CardDescription>تحديث كلمة المرور الخاصة بحسابك</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="current-password" required>كلمة المرور الحالية</FormLabel>
            <div className="relative">
              <Input id="current-password" type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required dir="ltr" className="text-start pe-10" />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <FormLabel htmlFor="new-password" required>كلمة المرور الجديدة</FormLabel>
              <div className="relative">
                <Input id="new-password" type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={12} dir="ltr" className="text-start pe-10" />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="confirm-password" required>تأكيد كلمة المرور</FormLabel>
              <div className="relative">
                <Input id="confirm-password" type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={12} dir="ltr" className={cn('text-left pe-10', confirmPassword && newPassword !== confirmPassword && 'border-destructive')} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword} className="gap-2 bg-portal hover:bg-portal-secondary text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              تغيير كلمة المرور
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
