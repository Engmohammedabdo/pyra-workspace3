'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ShieldCheck, ShieldOff, Loader2, QrCode, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface TwoFactorSetupProps {
  isEnabled: boolean;
  onStatusChange: () => void;
}

export function TwoFactorSetup({ isEnabled, onStatusChange }: TwoFactorSetupProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSetup = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/two-factor', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'فشل في إعداد المصادقة الثنائية');
        return;
      }
      setQrCode(json.data.qrCode);
      setSecret(json.data.secret);
      setSetupOpen(true);
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!token.trim()) {
      toast.error('أدخل رمز التحقق');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/two-factor', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'رمز غير صحيح');
        return;
      }
      toast.success('تم تفعيل المصادقة الثنائية بنجاح ✅');
      setSetupOpen(false);
      setToken('');
      onStatusChange();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!token.trim()) {
      toast.error('أدخل رمز التحقق');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/two-factor', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'رمز غير صحيح');
        return;
      }
      toast.success('تم تعطيل المصادقة الثنائية');
      setDisableOpen(false);
      setToken('');
      onStatusChange();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> المصادقة الثنائية (2FA)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge
              variant={isEnabled ? 'default' : 'secondary'}
              className={isEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : ''}
            >
              {isEnabled ? 'مفعّل' : 'غير مفعّل'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {isEnabled
              ? 'المصادقة الثنائية مفعلة. ستحتاج لإدخال رمز التحقق عند كل تسجيل دخول.'
              : 'فعّل المصادقة الثنائية لحماية حسابك بطبقة أمان إضافية.'}
          </p>
          {isEnabled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setToken(''); setDisableOpen(true); }}
              className="text-destructive"
            >
              <ShieldOff className="h-4 w-4 me-2" /> تعطيل 2FA
            </Button>
          ) : (
            <Button size="sm" onClick={handleSetup} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <QrCode className="h-4 w-4 me-2" />}
              إعداد 2FA
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إعداد المصادقة الثنائية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              امسح رمز QR باستخدام تطبيق المصادقة (Google Authenticator, Authy) ثم أدخل الرمز المكون من 6 أرقام.
            </p>

            {/* QR Code */}
            {qrCode && (
              <div className="flex justify-center p-4 bg-white rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="QR Code" className="w-48 h-48" />
              </div>
            )}

            {/* Manual secret */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">أو أدخل المفتاح يدوياً:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono break-all" dir="ltr">
                  {secret}
                </code>
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copySecret}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* Token input */}
            <div className="space-y-2">
              <p className="text-sm font-medium">أدخل رمز التحقق:</p>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-2xl tracking-[0.5em] font-mono"
                dir="ltr"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)}>إلغاء</Button>
            <Button onClick={handleVerify} disabled={loading || token.length < 6}>
              {loading ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : null}
              تأكيد وتفعيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable Dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعطيل المصادقة الثنائية</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              لتعطيل المصادقة الثنائية، أدخل الرمز الحالي من تطبيق المصادقة.
            </p>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="text-center text-2xl tracking-[0.5em] font-mono"
              dir="ltr"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleDisable(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisableOpen(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDisable} disabled={loading || token.length < 6}>
              {loading ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : null}
              تعطيل 2FA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
