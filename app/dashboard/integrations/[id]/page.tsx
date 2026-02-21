'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowRight, Save, Loader2, Webhook, Copy, RefreshCw, Send,
  Eye, EyeOff, RotateCcw, ChevronLeft, ChevronRight, KeyRound,
} from 'lucide-react';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface WebhookDetail {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  is_enabled: boolean;
  total_deliveries: number;
  success_deliveries: number;
  success_rate: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface DeliveryItem {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  response_status: number | null;
  response_body: string | null;
  attempt_count: number;
  max_attempts: number;
  status: string;
  next_retry_at: string | null;
  error_message: string | null;
  delivered_at: string | null;
  created_at: string;
}

/* ───────────────────────── Constants ───────────────────── */

const EVENT_LABELS: Record<string, string> = {
  file_uploaded: 'رفع ملف',
  project_status_changed: 'تغيير حالة مشروع',
  quote_signed: 'توقيع عرض سعر',
  invoice_paid: 'دفع فاتورة',
  invoice_overdue: 'فاتورة متأخرة',
  client_comment: 'تعليق عميل',
  approval_status_changed: 'تغيير حالة موافقة',
  project_created: 'إنشاء مشروع',
  client_created: 'إنشاء عميل',
  test: 'اختبار',
};

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

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  success: { label: 'ناجح', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  retrying: { label: 'قيد الإعادة', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  failed: { label: 'فشل', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

/* ───────────────────────── Component ──────────────────── */

export default function WebhookDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  /* ── webhook state ── */
  const [webhook, setWebhook] = useState<WebhookDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ── form fields ── */
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);

  /* ── saving ── */
  const [saving, setSaving] = useState(false);

  /* ── secret visibility ── */
  const [showSecret, setShowSecret] = useState(false);

  /* ── regenerate secret dialog ── */
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  /* ── test delivery ── */
  const [testing, setTesting] = useState(false);

  /* ── deliveries ── */
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const deliveryPageSize = 10;

  /* ── fetch webhook ── */
  const fetchWebhook = useCallback(async () => {
    try {
      const res = await fetch(`/api/webhooks/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || 'فشل في تحميل الـ Webhook');
        return;
      }
      const data = json.data as WebhookDetail;
      setWebhook(data);

      // Populate form
      setName(data.name);
      setUrl(data.url);
      setSelectedEvents(data.events || []);
      setIsEnabled(data.is_enabled);
    } catch {
      setError('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }, [id]);

  /* ── fetch deliveries ── */
  const fetchDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      const res = await fetch(
        `/api/webhooks/${id}/deliveries?page=${deliveryPage}&pageSize=${deliveryPageSize}`
      );
      const json = await res.json();
      if (json.data) {
        setDeliveries(json.data);
        setDeliveryTotal(json.meta?.total ?? 0);
      }
    } catch {
      // silent
    } finally {
      setLoadingDeliveries(false);
    }
  }, [id, deliveryPage]);

  useEffect(() => { fetchWebhook(); }, [fetchWebhook]);
  useEffect(() => { fetchDeliveries(); }, [fetchDeliveries]);

  /* ── event toggle ── */
  const toggleEvent = (eventValue: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventValue)
        ? prev.filter(e => e !== eventValue)
        : [...prev, eventValue]
    );
  };

  /* ── save ── */
  const handleSave = async () => {
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
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
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
        toast.error(json.error || 'فشل في حفظ التعديلات');
        return;
      }

      toast.success('تم حفظ التعديلات');
      fetchWebhook();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  /* ── regenerate secret ── */
  const handleRegenerateSecret = async () => {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_secret: true }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في إعادة توليد المفتاح');
        return;
      }

      toast.success('تم إعادة توليد المفتاح السري');
      setShowRegenDialog(false);
      setShowSecret(true);
      fetchWebhook();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setRegenerating(false);
    }
  };

  /* ── copy secret ── */
  const copySecret = () => {
    if (webhook?.secret) {
      navigator.clipboard.writeText(webhook.secret);
      toast.success('تم نسخ المفتاح السري');
    }
  };

  /* ── test webhook ── */
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في إرسال الاختبار');
        return;
      }

      if (json.data?.success) {
        toast.success('تم إرسال الاختبار بنجاح');
      } else {
        toast.error(`فشل الاختبار: ${json.data?.error || 'خطأ غير معروف'}`);
      }

      fetchDeliveries();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setTesting(false);
    }
  };

  /* ── retry delivery ── */
  const handleRetry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    try {
      const res = await fetch(`/api/webhooks/${id}/deliveries/${deliveryId}/retry`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في إعادة المحاولة');
        return;
      }

      toast.success(json.data?.status === 'success' ? 'تم التسليم بنجاح' : 'تمت إعادة المحاولة');
      fetchDeliveries();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setRetryingId(null);
    }
  };

  /* ── masked secret ── */
  const maskedSecret = webhook?.secret
    ? webhook.secret.slice(0, 8) + '••••••••••••••••••••'
    : '';

  const totalPages = Math.ceil(deliveryTotal / deliveryPageSize);

  /* ──────────────────── Loading State ─────────────────── */
  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[300px]" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  /* ──────────────────── Error State ───────────────────── */
  if (error || !webhook) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/integrations">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">خطأ</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Webhook className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p>{error || 'الـ Webhook غير موجود'}</p>
            <Link href="/dashboard/integrations">
              <Button variant="outline" className="mt-4">العودة للتكاملات</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/integrations">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Webhook className="h-6 w-6" /> تفاصيل الـ Webhook
            </h1>
            <p className="text-muted-foreground text-sm">
              {webhook.name} — {webhook.total_deliveries} تسليم
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="h-4 w-4 me-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 me-2" />
            )}
            اختبار
          </Button>
          <Badge
            variant="outline"
            className={
              webhook.is_enabled
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }
          >
            {webhook.is_enabled ? 'مفعّل' : 'معطّل'}
          </Badge>
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
              placeholder="اسم الـ Webhook"
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
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              id="is-enabled"
            />
            <Label htmlFor="is-enabled">تفعيل الـ Webhook</Label>
          </div>
        </CardContent>
      </Card>

      {/* Secret */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> المفتاح السري
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setShowRegenDialog(true)}
          >
            <RefreshCw className="h-3.5 w-3.5 me-1" /> إعادة توليد
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                value={showSecret ? webhook.secret : maskedSecret}
                readOnly
                dir="ltr"
                className="font-mono text-sm pe-20"
              />
              <div className="absolute inset-y-0 end-0 flex items-center gap-1 pe-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={copySecret}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            استخدم هذا المفتاح للتحقق من توقيع HMAC-SHA256 في الهيدر X-Pyra-Signature
          </p>
        </CardContent>
      </Card>

      {/* Events */}
      <Card>
        <CardHeader>
          <CardTitle>الأحداث <span className="text-destructive">*</span></CardTitle>
        </CardHeader>
        <CardContent>
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

      {/* Save */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/integrations">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button
          className="bg-orange-500 hover:bg-orange-600"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 me-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 me-2" />
          )}
          حفظ التعديلات
        </Button>
      </div>

      {/* Delivery Log */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            سجل التسليم
            {deliveryTotal > 0 && (
              <Badge variant="outline" className="font-mono text-xs">
                {deliveryTotal}
              </Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchDeliveries}>
            <RefreshCw className="h-3.5 w-3.5 me-1" /> تحديث
          </Button>
        </CardHeader>
        <CardContent>
          {loadingDeliveries ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد سجلات تسليم بعد
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-start p-3 font-medium">التاريخ</th>
                      <th className="text-start p-3 font-medium">الحدث</th>
                      <th className="text-start p-3 font-medium">الحالة</th>
                      <th className="text-start p-3 font-medium">كود الاستجابة</th>
                      <th className="text-start p-3 font-medium">المحاولات</th>
                      <th className="text-start p-3 font-medium">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.map(delivery => {
                      const statusInfo = STATUS_BADGES[delivery.status] || {
                        label: delivery.status,
                        color: 'bg-gray-100 text-gray-700',
                      };
                      const canRetry =
                        (delivery.status === 'failed' || delivery.status === 'retrying') &&
                        delivery.attempt_count < (delivery.max_attempts || 3);

                      return (
                        <tr key={delivery.id} className="border-b">
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(delivery.created_at, 'dd-MM-yyyy HH:mm')}
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className="text-xs">
                              {EVENT_LABELS[delivery.event] || delivery.event}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={statusInfo.color}>
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {delivery.response_status || '—'}
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {delivery.attempt_count}/{delivery.max_attempts || 3}
                          </td>
                          <td className="p-3">
                            {canRetry && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleRetry(delivery.id)}
                                disabled={retryingId === delivery.id}
                              >
                                {retryingId === delivery.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3 me-1" />
                                )}
                                إعادة
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-xs text-muted-foreground">
                    صفحة {deliveryPage} من {totalPages} — إجمالي {deliveryTotal} سجل
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deliveryPage <= 1}
                      onClick={() => setDeliveryPage(prev => prev - 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deliveryPage >= totalPages}
                      onClick={() => setDeliveryPage(prev => prev + 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Meta info */}
      <div className="text-xs text-muted-foreground">
        أنشئ بواسطة {webhook.created_by || '—'} في {formatDate(webhook.created_at)} — آخر تحديث: {formatRelativeDate(webhook.updated_at)}
      </div>

      {/* Regenerate Secret Dialog */}
      <Dialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>إعادة توليد المفتاح السري</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            سيتم استبدال المفتاح السري الحالي بمفتاح جديد. ستحتاج إلى تحديث المفتاح في جميع الأنظمة المتكاملة. لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenDialog(false)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={handleRegenerateSecret}
              disabled={regenerating}
            >
              {regenerating ? 'جارٍ التوليد...' : 'إعادة توليد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
