'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogIn, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
        } else if (authError.message.includes('Email not confirmed')) {
          setError('لم يتم تأكيد البريد الإلكتروني');
        } else {
          setError(authError.message);
        }
        return;
      }

      router.push(redirectTo);
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
      <div className="hidden lg:flex flex-col items-center justify-center bg-gradient-to-br from-orange-500 to-orange-600 p-12 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-40 h-40 border border-white/30 rounded-full" />
          <div className="absolute bottom-20 right-10 w-60 h-60 border border-white/20 rounded-full" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 border border-white/10 rounded-full" />
        </div>
        <div className="relative z-10 text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              PYRAMEDIA X
            </h1>
            <p className="text-orange-100 text-lg">
              FOR AI SOLUTIONS
            </p>
          </div>
          <div className="w-16 h-[2px] bg-white/60 mx-auto" />
          <p className="text-orange-50/80 text-sm max-w-[250px] leading-relaxed">
            منصة إدارة الملفات والمشاريع الذكية
          </p>
          <p className="text-orange-100/50 text-xs">
            v3.0
          </p>
        </div>
      </div>

      {/* Form Side */}
      <Card className="border-0 rounded-none lg:rounded-none shadow-none">
        <CardHeader className="space-y-3 pt-12 pb-6 px-8 lg:px-12">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-4">
            <h2 className="text-2xl font-bold text-orange-500">PYRAMEDIA X</h2>
            <p className="text-xs text-muted-foreground">FOR AI SOLUTIONS</p>
          </div>
          <CardTitle className="text-2xl font-bold">
            تسجيل الدخول
          </CardTitle>
          <CardDescription>
            أدخل بياناتك للوصول إلى لوحة التحكم
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 lg:px-12 pb-12">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@pyramedia.ae"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                dir="ltr"
                className="text-left"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <div className="relative">
                <Input
                  id="password"
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
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11"
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
            &copy; {new Date().getFullYear()} PYRAMEDIA X &mdash; FOR AI SOLUTIONS
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
