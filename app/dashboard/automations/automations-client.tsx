'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAutomations } from '@/hooks/useAutomations';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Zap, Plus, Trash2, Pencil, Power, PowerOff, ScrollText, ArrowRight,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  is_enabled: boolean;
  execution_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ───────────────────────── Constants ───────────────────── */

const TRIGGER_LABELS: Record<string, string> = {
  file_uploaded: 'رفع ملف',
  project_status_changed: 'تغيير حالة مشروع',
  quote_signed: 'توقيع عرض سعر',
  invoice_overdue: 'فاتورة متأخرة',
  client_comment: 'تعليق عميل',
  approval_status_changed: 'تغيير حالة موافقة',
  invoice_paid: 'دفع فاتورة',
  project_created: 'إنشاء مشروع',
  client_created: 'إنشاء عميل',
};

/* ───────────────────────── Component ──────────────────── */

export default function AutomationsClient() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // React Query hooks
  const { data: rules = [], isLoading: loading } = useAutomations() as unknown as { data: AutomationRule[]; isLoading: boolean };


  /* ── delete dialog ── */
  const [showDelete, setShowDelete] = useState(false);
  const [selected, setSelected] = useState<AutomationRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ── toggling state ── */
  const [togglingId, setTogglingId] = useState<string | null>(null);



  /* ── toggle enable/disable ── */
  const handleToggle = async (rule: AutomationRule) => {
    setTogglingId(rule.id);
    try {
      const res = await fetch(`/api/automations/${rule.id}/toggle`, { method: 'PATCH' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في تغيير الحالة');
        return;
      }
      toast.success(json.data?.is_enabled ? 'تم تفعيل القاعدة' : 'تم تعطيل القاعدة');
      queryClient.invalidateQueries({ queryKey: ['automations'] });
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
      const res = await fetch(`/api/automations/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في حذف القاعدة');
        return;
      }
      setShowDelete(false);
      setSelected(null);
      toast.success('تم حذف القاعدة');
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setDeleting(false);
    }
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6" aria-hidden="true" /> الأتمتة
          </h1>
          <p className="text-muted-foreground">إدارة قواعد الأتمتة والتشغيل التلقائي</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/automations/log">
            <Button variant="outline">
              <ScrollText className="h-4 w-4 me-2" /> سجل التنفيذ
            </Button>
          </Link>
          <Link href="/dashboard/automations/new">
            <Button className="bg-orange-500 hover:bg-orange-600">
              <Plus className="h-4 w-4 me-2" /> إضافة قاعدة
            </Button>
          </Link>
        </div>
      </div>

      {/* Rules List */}
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
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="لا توجد قواعد أتمتة"
          description="أنشئ قاعدة جديدة لأتمتة المهام المتكررة وتوفير الوقت"
          actionLabel="إضافة قاعدة"
          onAction={() => router.push('/dashboard/automations/new')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map(rule => (
            <Card
              key={rule.id}
              className={`transition-colors ${!rule.is_enabled ? 'opacity-60' : ''}`}
            >
              <CardContent className="p-5 space-y-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base truncate">{rule.name}</h3>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {rule.description}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      rule.is_enabled
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }
                  >
                    {rule.is_enabled ? 'مفعّل' : 'معطّل'}
                  </Badge>
                </div>

                {/* Info badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">
                    {TRIGGER_LABELS[rule.trigger_event] || rule.trigger_event}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-xs">
                    {rule.execution_count} تنفيذ
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(rule.created_at)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/automations/${rule.id}`)}
                  >
                    <Pencil className="h-3.5 w-3.5 me-1" /> تعديل
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(rule)}
                    disabled={togglingId === rule.id}
                  >
                    {rule.is_enabled ? (
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
                    onClick={() => { setSelected(rule); setShowDelete(true); }}
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
            <DialogTitle>حذف قاعدة الأتمتة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف القاعدة <strong>{selected?.name}</strong>؟ سيتم حذف جميع سجلات التنفيذ المرتبطة بها. لا يمكن التراجع عن هذا الإجراء.
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
