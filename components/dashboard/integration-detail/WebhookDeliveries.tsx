'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { RefreshCw, RotateCcw, Loader2, ChevronRight, ChevronLeft, Send } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  success: { label: 'ناجح', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  retrying: { label: 'قيد الإعادة', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  failed: { label: 'فشل', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

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
  expense_created: 'إنشاء مصروف',
  invoice_created: 'إنشاء فاتورة',
  invoice_sent: 'إرسال فاتورة',
  subscription_created: 'إنشاء اشتراك',
  test: 'اختبار',
};

export function WebhookDeliveries({
  deliveries,
  loading,
  total,
  page,
  totalPages,
  onRefresh,
  onRetry,
  retryingId,
  onPageChange
}: {
  deliveries: any[];
  loading: boolean;
  total: number;
  page: number;
  totalPages: number;
  onRefresh: () => void;
  onRetry: (id: string) => void;
  retryingId: string | null;
  onPageChange: (p: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          سجل التسليم
          {total > 0 && <Badge variant="outline" className="font-mono text-xs">{total}</Badge>}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5 me-1" /> تحديث
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : deliveries.length === 0 ? (
          <EmptyState icon={Send} title="لا توجد سجلات تسليم بعد" className="py-6" />
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
                    const statusInfo = STATUS_BADGES[delivery.status] || { label: delivery.status, color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' };
                    const canRetry = (delivery.status === 'failed' || delivery.status === 'retrying') && delivery.attempt_count < (delivery.max_attempts || 3);
                    return (
                      <tr key={delivery.id} className="border-b">
                        <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(delivery.created_at, 'dd-MM-yyyy HH:mm')}</td>
                        <td className="p-3"><Badge variant="secondary" className="text-xs">{EVENT_LABELS[delivery.event] || delivery.event}</Badge></td>
                        <td className="p-3"><Badge variant="outline" className={statusInfo.color}>{statusInfo.label}</Badge></td>
                        <td className="p-3 font-mono text-xs">{delivery.response_status || '—'}</td>
                        <td className="p-3 font-mono text-xs">{delivery.attempt_count}/{delivery.max_attempts || 3}</td>
                        <td className="p-3">
                          {canRetry && (
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onRetry(delivery.id)} disabled={retryingId === delivery.id}>
                              {retryingId === delivery.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3 me-1" />}
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
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground">صفحة {page} من {totalPages} — إجمالي {total} سجل</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronLeft className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
