'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Webhook, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { WebhookBasicInfo } from '@/components/dashboard/integration-detail/WebhookBasicInfo';
import { WebhookSecretInfo } from '@/components/dashboard/integration-detail/WebhookSecretInfo';
import { WebhookEvents } from '@/components/dashboard/integration-detail/WebhookEvents';
import { WebhookDeliveries } from '@/components/dashboard/integration-detail/WebhookDeliveries';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';

const AVAILABLE_EVENTS = [
  { value: 'file_uploaded', label: 'رفع ملف' },
  { value: 'project_status_changed', label: 'تغيير حالة مشروع' },
  { value: 'quote_signed', label: 'توقيع عرض سعر' },
  { value: 'invoice_paid', label: 'دفع فاتورة' },
  { value: 'invoice_overdue', label: 'فاتورة متأخرة' },
  { value: 'client_comment', label: 'تعليق عميل' },
  { value: 'approval_status_changed', label: 'تغيير حالة موافقة' },
  { value: 'project_created', label: 'إنشاء مشروع' },
  { value: 'client_created', label: 'إنشاء عميل' },
  { value: 'expense_created', label: 'إنشاء مصروف' },
  { value: 'invoice_created', label: 'إنشاء فاتورة' },
  { value: 'invoice_sent', label: 'إرسال فاتورة' },
  { value: 'subscription_created', label: 'إنشاء اشتراك' },
];

export default function WebhookDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [webhook, setWebhook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [isEnabled, setIsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(true);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchWebhook = useCallback(async () => {
    try {
      const res = await fetch(`/api/webhooks/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || 'فشل في تحميل الـ Webhook');
        return;
      }
      setWebhook(json.data);
      setName(json.data.name);
      setUrl(json.data.url);
      setSelectedEvents(json.data.events || []);
      setIsEnabled(json.data.is_enabled);
    } catch {
      setError('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchDeliveries = useCallback(async () => {
    setLoadingDeliveries(true);
    try {
      const res = await fetch(`/api/webhooks/${id}/deliveries?page=${deliveryPage}&pageSize=10`);
      const json = await res.json();
      if (json.data) {
        setDeliveries(json.data);
        setDeliveryTotal(json.meta?.total ?? 0);
      }
    } catch { } finally { setLoadingDeliveries(false); }
  }, [id, deliveryPage]);

  useEffect(() => { fetchWebhook(); fetchDeliveries(); }, [fetchWebhook, fetchDeliveries]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), url: url.trim(), events: selectedEvents, is_enabled: isEnabled }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { toast.error(json.error); return; }
      toast.success('تم حفظ التعديلات');
      fetchWebhook();
    } catch { toast.error('حدث خطأ'); } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: 'POST' });
      const json = await res.json();
      if (json.data?.success) toast.success('تم إرسال الاختبار بنجاح');
      else toast.error('فشل الاختبار');
      fetchDeliveries();
    } catch { toast.error('حدث خطأ'); } finally { setTesting(false); }
  };

  const handleRegenerate = async () => {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate_secret: true }),
      });
      if (!res.ok) { toast.error('فشل إعادة التوليد'); return; }
      toast.success('تم إعادة توليد المفتاح');
      fetchWebhook();
    } catch { toast.error('حدث خطأ'); }
  };

  const handleRetry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    try {
      await fetch(`/api/webhooks/${id}/deliveries/${deliveryId}/retry`, { method: 'POST' });
      toast.success('تمت إعادة المحاولة');
      fetchDeliveries();
    } catch { toast.error('حدث خطأ'); } finally { setRetryingId(null); }
  };

  if (loading) return <div className="space-y-6 max-w-4xl"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;

  if (error || !webhook) return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">خطأ</h1>
      <Button variant="outline" onClick={() => window.history.back()}>العودة</Button>
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/integrations" aria-label="العودة إلى التكاملات"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Webhook className="h-6 w-6" aria-hidden="true" /> تفاصيل الـ Webhook</h1>
            <p className="text-sm text-muted-foreground">{webhook.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing}>{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 me-2" />} اختبار</Button>
          <Badge className={webhook.is_enabled ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}>{webhook.is_enabled ? 'مفعّل' : 'معطّل'}</Badge>
        </div>
      </div>
      <WebhookBasicInfo {...{ webhook, name, setName, url, setUrl, isEnabled, setIsEnabled, onSave: handleSave, saving }} />
      <WebhookSecretInfo {...{ webhook, onRegenerate: handleRegenerate, regenerating: false }} />
      <WebhookEvents {...{ selectedEvents, toggleEvent: (val) => setSelectedEvents(prev => prev.includes(val) ? prev.filter(e => e !== val) : [...prev, val]), availableEvents: AVAILABLE_EVENTS }} />
      <WebhookDeliveries {...{ deliveries, loading: loadingDeliveries, total: deliveryTotal, page: deliveryPage, totalPages: Math.ceil(deliveryTotal / 10), onRefresh: fetchDeliveries, onRetry: handleRetry, retryingId, onPageChange: (p) => setDeliveryPage(p) }} />
      <div className="text-xs text-muted-foreground">أنشئ بواسطة {webhook.created_by || '—'} في {formatDate(webhook.created_at)} — آخر تحديث: {formatRelativeDate(webhook.updated_at)}</div>
    </div>
  );
}
