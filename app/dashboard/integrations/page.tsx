'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Webhook, Plus, Trash2, Pencil, Power, PowerOff, ExternalLink,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_enabled: boolean;
  success_rate: number | null;
  last_delivery: string | null;
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
};

/* ───────────────────────── Component ──────────────────── */

export default function IntegrationsPage() {
  const router = useRouter();

  /* ── list state ── */
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── delete dialog ── */
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<WebhookItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── toggling state ── */
  const [togglingId, setTogglingId] = useState<string | null>(null);

  /* ── fetch webhooks ── */
  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      const json = await res.json();
      if (json.data) setWebhooks(json.data);
    } catch {
      toast.error('حدث خطأ في تحميل الـ Webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  /* ── toggle enable/disable ── */
  const handleToggle = async (webhook: WebhookItem) => {
    setTogglingId(webhook.id);
    try {
      const res = await fetch(`/api/webhooks/${webhook.id}/toggle`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في تغيير الحالة');
        return;
      }
      toast.success(json.data?.is_enabled ? 'تم تفعيل الـ Webhook' : 'تم تعطيل الـ Webhook');
      setWebhooks(prev => prev.map(w =>
        w.id === webhook.id ? { ...w, is_enabled: json.data.is_enabled } : w
      ));
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setTogglingId(null);
    }
  };

  /* ── delete ── */
  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/webhooks/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في حذف الـ Webhook');
        return;
      }
      setShowDelete(false);
      setSelected(null);
      toast.success('تم حذف الـ Webhook');
      fetchWebhooks();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setDeleting(false);
    }
  };

  /* ── success rate badge color ── */
  const getSuccessRateColor = (rate: number | null) => {
    if (rate === null) return 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';
    if (rate >= 90) return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    if (rate >= 50) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6" /> التكاملات
          </h1>
          <p className="text-muted-foreground">إدارة Webhooks والتكاملات الخارجية</p>
        </div>
        <Link href="/dashboard/integrations/new">
          <Button className="bg-orange-500 hover:bg-orange-600">
            <Plus className="h-4 w-4 me-2" /> إضافة Webhook
          </Button>
        </Link>
      </div>

      {/* Webhooks List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Webhook className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p>لا توجد Webhooks</p>
            <p className="text-xs mt-1">أنشئ Webhook جديد للبدء في التكامل مع الأنظمة الخارجية</p>
            <Link href="/dashboard/integrations/new">
              <Button className="mt-4 bg-orange-500 hover:bg-orange-600">
                <Plus className="h-4 w-4 me-2" /> إضافة Webhook
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {webhooks.map(webhook => (
            <Card
              key={webhook.id}
              className={`transition-colors ${!webhook.is_enabled ? 'opacity-60' : ''}`}
            >
              <CardContent className="p-5 space-y-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base truncate">{webhook.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 truncate font-mono" dir="ltr">
                      {webhook.url}
                    </p>
                  </div>
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

                {/* Events & stats badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {webhook.events.slice(0, 3).map(event => (
                    <Badge key={event} variant="secondary" className="text-xs">
                      {EVENT_LABELS[event] || event}
                    </Badge>
                  ))}
                  {webhook.events.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{webhook.events.length - 3}
                    </Badge>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 text-xs">
                  <Badge variant="outline" className={getSuccessRateColor(webhook.success_rate)}>
                    {webhook.success_rate !== null ? `${webhook.success_rate}% نجاح` : 'لا توجد بيانات'}
                  </Badge>
                  {webhook.last_delivery && (
                    <span className="text-muted-foreground">
                      آخر تسليم: {formatRelativeDate(webhook.last_delivery)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/integrations/${webhook.id}`)}
                  >
                    <Pencil className="h-3.5 w-3.5 me-1" /> تفاصيل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(webhook)}
                    disabled={togglingId === webhook.id}
                  >
                    {webhook.is_enabled ? (
                      <>
                        <PowerOff className="h-3.5 w-3.5 me-1" /> تعطيل
                      </>
                    ) : (
                      <>
                        <Power className="h-3.5 w-3.5 me-1" /> تفعيل
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => { setSelected(webhook); setShowDelete(true); }}
                  >
                    <Trash2 className="h-3.5 w-3.5 me-1" /> حذف
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف الـ Webhook</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف الـ Webhook <strong>{selected?.name}</strong>؟ سيتم حذف جميع سجلات التسليم المرتبطة به. لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جارٍ الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
