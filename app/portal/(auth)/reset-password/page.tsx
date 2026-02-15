'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Loader2,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Building2,
} from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!token) {
      setError('رمز إعادة التعيين مفقود. يرجى استخدام الرابط المرسل إلى بريدك الإلكتروني.');
      return;
    }

    if (password.length < 12) {
      setError('كلمة المرور يجب أن تكون 12 حرف على الأقل');
      return;
    }

    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/portal/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'حدث خطأ أثناء إعادة تعيين كلمة المرور');
        return;
      }

      setSuccess(true);
      // Auto redirect after 3 seconds
      setTimeout(() => {
        router.push('/portal/login');
      }, 3000);
    } catch {
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-foreground">
            تم إعادة تعيين كلمة المرور بنجاح
          </p>
          <p className="text-sm text-muted-foreground">
            سيتم تحويلك لصفحة تسجيل الدخول خلال لحظات...
          </p>
        </div>
        <Link href="/portal/login">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowRight className="h-4 w-4" />
            تسجيل الدخول الآن
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* New Password */}
      <div className="space-y-2">
        <Label htmlFor="reset-password">كلمة المرور الجديدة</Label>
        <div className="relative">
          <Input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            dir="ltr"
            className="text-left pe-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Confirm Password */}
      <div className="space-y-2">
        <Label htmlFor="reset-confirm">تأكيد كلمة المرور</Label>
        <div className="relative">
          <Input
            id="reset-confirm"
            type={showConfirm ? 'text' : 'password'}
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            dir="ltr"
            className="text-left pe-10"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showConfirm ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        يجب أن تتكون كلمة المرور من 12 حرف على الأقل
      </p>

      {/* Error message */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
          {error}
        </div>
      )}

      <Button
        type="submit"
        className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري إعادة التعيين...
          </>
        ) : (
          'إعادة تعيين كلمة المرور'
        )}
      </Button>

      <div className="text-center">
        <Link
          href="/portal/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    </form>
  );
}

export default function PortalResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <Card className="shadow-xl">
        <CardHeader className="space-y-3 pt-8 pb-4 px-8 text-center">
          {/* Logo */}
          <div className="mx-auto mb-2">
            <div className="inline-flex items-center gap-1.5 bg-orange-500/10 text-orange-600 rounded-full px-4 py-1.5 text-sm font-medium">
              <Building2 className="h-4 w-4" />
              بوابة العملاء
            </div>
          </div>

          <div className="mx-auto w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
            <KeyRound className="h-6 w-6 text-orange-600" />
          </div>

          <CardTitle className="text-xl font-bold">
            إعادة تعيين كلمة المرور
          </CardTitle>
          <CardDescription>
            أدخل كلمة المرور الجديدة لحسابك
          </CardDescription>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
