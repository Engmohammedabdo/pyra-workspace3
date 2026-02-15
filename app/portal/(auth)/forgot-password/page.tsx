'use client';

import { useState } from 'react';
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
import { Loader2, ArrowRight, Mail, CheckCircle2, Building2 } from 'lucide-react';

export default function PortalForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/portal/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'حدث خطأ أثناء إرسال الطلب');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

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

          <CardTitle className="text-xl font-bold">
            استعادة كلمة المرور
          </CardTitle>
          <CardDescription>
            أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور
          </CardDescription>
        </CardHeader>

        <CardContent className="px-8 pb-8">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-green-600" />
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">
                  تم إرسال الرابط بنجاح
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  إذا كان البريد الإلكتروني مسجلاً لدينا، ستصلك رسالة تحتوي على
                  رابط إعادة تعيين كلمة المرور.
                </p>
              </div>
              <Link href="/portal/login">
                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                >
                  <ArrowRight className="h-4 w-4" />
                  العودة لتسجيل الدخول
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">البريد الإلكتروني</Label>
                <div className="relative">
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="client@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    dir="ltr"
                    className="text-left ps-10"
                  />
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

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
                    جاري الإرسال...
                  </>
                ) : (
                  'إرسال رابط الاستعادة'
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
