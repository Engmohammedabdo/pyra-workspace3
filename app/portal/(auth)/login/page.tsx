'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2, LogIn, Eye, EyeOff, Building2 } from 'lucide-react';

export default function PortalLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          remember_me: rememberMe,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'حدث خطأ أثناء تسجيل الدخول');
        return;
      }

      router.push('/portal/projects');
      router.refresh();
    } catch {
      setError('حدث خطأ غير متوقع. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-[960px] grid grid-cols-1 lg:grid-cols-2 gap-0 rounded-2xl overflow-hidden shadow-2xl">
      {/* Branding Side */}
      <div className="hidden lg:flex flex-col items-center justify-center bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 p-12 text-white relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 start-10 w-40 h-40 border border-white/30 rounded-full" />
          <div className="absolute bottom-20 end-10 w-60 h-60 border border-white/20 rounded-full" />
          <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-white/10 rounded-full" />
          <div className="absolute bottom-10 start-20 w-20 h-20 border border-white/25 rounded-full" />
        </div>

        <div className="relative z-10 text-center space-y-8">
          {/* Logo */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              PYRAMEDIA X
            </h1>
            <p className="text-orange-100 text-lg">FOR AI SOLUTIONS</p>
          </div>

          <div className="w-16 h-[2px] bg-white/60 mx-auto" />

          {/* Portal badge */}
          <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm rounded-full px-5 py-2.5">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold text-base">
              بوابة العملاء
            </span>
          </div>

          <p className="text-orange-50/80 text-sm max-w-[280px] leading-relaxed mx-auto">
            تابع مشاريعك، استعرض الملفات، وتواصل مع فريق العمل بسهولة
          </p>

          <p className="text-orange-100/40 text-xs">v3.0</p>
        </div>
      </div>

      {/* Form Side */}
      <Card className="border-0 rounded-none lg:rounded-none shadow-none">
        <CardHeader className="space-y-3 pt-12 pb-6 px-8 lg:px-12">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-4">
            <h2 className="text-2xl font-bold text-orange-500">PYRAMEDIA X</h2>
            <p className="text-xs text-muted-foreground">FOR AI SOLUTIONS</p>
            <div className="inline-flex items-center gap-1.5 mt-3 bg-orange-500/10 text-orange-600 rounded-full px-4 py-1.5 text-sm font-medium">
              <Building2 className="h-4 w-4" />
              بوابة العملاء
            </div>
          </div>

          <CardTitle className="text-2xl font-bold">تسجيل الدخول</CardTitle>
          <CardDescription>
            أدخل بياناتك للوصول إلى بوابة العملاء
          </CardDescription>
        </CardHeader>

        <CardContent className="px-8 lg:px-12 pb-12">
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="portal-email">البريد الإلكتروني</Label>
              <Input
                id="portal-email"
                type="email"
                placeholder="client@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="text-left"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="portal-password">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="portal-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
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

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="portal-remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) =>
                    setRememberMe(checked === true)
                  }
                />
                <Label
                  htmlFor="portal-remember"
                  className="text-sm font-normal cursor-pointer"
                >
                  تذكرني
                </Label>
              </div>
              <Link
                href="/portal/forgot-password"
                className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري تسجيل الدخول...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  تسجيل الدخول
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-8">
            &copy; {new Date().getFullYear()} PYRAMEDIA X &mdash; FOR AI
            SOLUTIONS
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
