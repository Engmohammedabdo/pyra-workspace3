'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ArrowRight, Save, Loader2, Webhook,
} from 'lucide-react';
import { toast } from 'sonner';

/* ───────────────────────── Constants ───────────────────── */

const AVAILABLE_EVENTS: { value: string; label: string }[] = [
  { value: 'file_uploaded', label: 'رفع ملف' },
  { value: 'project_status_changed', label: 'تغيير حالة مشروع' },
  { value: 'quote_signed', label: 'توقيع عرض سعر' },
  { value: 'invoice_paid', label: 'دفع فاتورة' },
  { value: 'invoice_overdue', label: 'فاتورة متأخرة' },
  { value: 'client_comment', label: 'تعليق عميل' },
  { value: 'approval_status_changed', label: 'تغيير حالة موافقة' },
  { value: 'project_created', label: 'إنشاء مشروع' },
  { value: 'client_created', label: 'إنشاء عميل' },
];

/* ───────────────────────── Component ──────────────────── */

export default function NewWebhookPage() {
  const router = useRouter();

  /* ── form fields ── */
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);

  /* ── saving ── */
  const [saving, setSaving] = useState(false);

  /* ── event toggle ── */
  const toggleEvent = (eventValue: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventValue)
        ? prev.filter(e => e !== eventValue)
        : [...prev, eventValue]
    );
  };

  const toggleAll = () => {
    if (selectedEvents.length === AVAILABLE_EVENTS.length) {
      setSelectedEvents([]);
    } else {
      setSelectedEvents(AVAILABLE_EVENTS.map(e => e.value));
    }
  };

  /* ── submit ── */
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('اسم الـ Webhook مطلوب');
      return;
    }
    if (!url.trim()) {
      toast.error('رابط الـ Webhook مطلوب');
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error('يجب اختيار حدث واحد على الأقل');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: url.trim(),
          events: selectedEvents,
          is_enabled: isEnabled,
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'حدث خطأ في إنشاء الـ Webhook');
        return;
      }

      toast.success('تم إنشاء الـ Webhook بنجاح');
      router.push(`/dashboard/integrations/${json.data.id}`);
    } catch {
      toast.error('حدث خطأ في إنشاء الـ Webhook');
    } finally {
      setSaving(false);
    }
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/integrations">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6" /> إضافة Webhook جديد
          </h1>
          <p className="text-muted-foreground">إنشاء نقطة تكامل خارجية جديدة</p>
        </div>
      </div>

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>المعلومات الأساسية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>اسم الـ Webhook <span className="text-destructive">*</span></Label>
            <Input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="مثال: إشعار Slack، تحديث CRM"
            />
          </div>

          <div className="space-y-2">
            <Label>رابط الـ Webhook (URL) <span className="text-destructive">*</span></Label>
            <Input
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">
              سيتم إرسال طلب POST مع توقيع HMAC-SHA256 في الهيدر
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              id="is-enabled"
            />
            <Label htmlFor="is-enabled">تفعيل الـ Webhook فورًا</Label>
          </div>
        </CardContent>
      </Card>

      {/* Events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>الأحداث <span className="text-destructive">*</span></CardTitle>
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {selectedEvents.length === AVAILABLE_EVENTS.length ? 'إلغاء الكل' : 'تحديد الكل'}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            اختر الأحداث التي سيتم إرسال إشعار عند حدوثها
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AVAILABLE_EVENTS.map(event => (
              <label
                key={event.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedEvents.includes(event.value)
                    ? 'border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-950'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedEvents.includes(event.value)}
                  onChange={() => toggleEvent(event.value)}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm font-medium">{event.label}</span>
                <span className="text-xs text-muted-foreground font-mono ms-auto" dir="ltr">
                  {event.value}
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3 items-start">
            <Webhook className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>سيتم توليد مفتاح سري (Secret) تلقائيًا بعد الإنشاء.</p>
              <p>يمكنك استخدام المفتاح للتحقق من صحة الطلبات الواردة عبر توقيع HMAC-SHA256.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/integrations">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button
          className="bg-orange-500 hover:bg-orange-600"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 me-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 me-2" />
          )}
          إنشاء Webhook
        </Button>
      </div>
    </div>
  );
}
