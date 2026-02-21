'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowRight, ScrollText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface LogEntry {
  id: string;
  rule_id: string;
  rule_name: string;
  trigger_event: string;
  trigger_data: Record<string, unknown> | null;
  actions_executed: Array<Record<string, unknown>> | null;
  status: string;
  error_message: string | null;
  executed_at: string;
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

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  success: { label: 'ناجح', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  partial_failure: { label: 'جزئي', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  failed: { label: 'فشل', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

const PAGE_SIZE = 20;

/* ───────────────────────── Component ──────────────────── */

export default function AutomationLogPage() {
  /* ── list state ── */
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  /* ── expanded rows ── */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /* ── fetch logs ── */
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/automations/log?${params}`);
      const json = await res.json();
      if (json.data) setLogs(json.data);
      if (json.meta?.total !== undefined) setTotal(json.meta.total);
    } catch {
      toast.error('حدث خطأ في تحميل سجل التنفيذ');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  /* ── reset page on filter change ── */
  useEffect(() => { setPage(1); }, [statusFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automations">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ScrollText className="h-6 w-6" /> سجل تنفيذ الأتمتة
            </h1>
            <p className="text-muted-foreground">عرض جميع سجلات تنفيذ قواعد الأتمتة</p>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="success">ناجح</SelectItem>
            <SelectItem value="partial_failure">جزئي</SelectItem>
            <SelectItem value="failed">فشل</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {total} سجل
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium w-[30px]" />
                  <th className="text-start p-3 font-medium">التاريخ</th>
                  <th className="text-start p-3 font-medium">اسم القاعدة</th>
                  <th className="text-start p-3 font-medium">حدث التشغيل</th>
                  <th className="text-start p-3 font-medium">الحالة</th>
                  <th className="text-start p-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-muted-foreground">
                      <ScrollText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p>لا توجد سجلات تنفيذ</p>
                    </td>
                  </tr>
                ) : (
                  logs.map(log => {
                    const statusInfo = STATUS_BADGES[log.status] || {
                      label: log.status,
                      color: 'bg-gray-100 text-gray-700',
                    };
                    const isExpanded = expandedId === log.id;

                    return (
                      <>
                        <tr
                          key={log.id}
                          className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        >
                          <td className="p-3">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {formatDate(log.executed_at, 'dd-MM-yyyy HH:mm')}
                          </td>
                          <td className="p-3 font-medium">{log.rule_name}</td>
                          <td className="p-3">
                            <Badge variant="secondary">
                              {TRIGGER_LABELS[log.trigger_event] || log.trigger_event}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" className={statusInfo.color}>
                              {statusInfo.label}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-xs">
                            {log.actions_executed?.length ?? 0}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${log.id}-detail`} className="border-b bg-muted/20">
                            <td colSpan={6} className="p-4">
                              <div className="space-y-3">
                                {/* Trigger Data */}
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    بيانات الحدث:
                                  </p>
                                  <pre
                                    className="text-xs bg-muted p-3 rounded-lg overflow-x-auto font-mono"
                                    dir="ltr"
                                  >
                                    {log.trigger_data
                                      ? JSON.stringify(log.trigger_data, null, 2)
                                      : '—'}
                                  </pre>
                                </div>

                                {/* Actions Executed */}
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">
                                    الإجراءات المنفذة:
                                  </p>
                                  <pre
                                    className="text-xs bg-muted p-3 rounded-lg overflow-x-auto font-mono"
                                    dir="ltr"
                                  >
                                    {log.actions_executed
                                      ? JSON.stringify(log.actions_executed, null, 2)
                                      : '—'}
                                  </pre>
                                </div>

                                {/* Error Message */}
                                {log.error_message && (
                                  <div>
                                    <p className="text-xs font-medium text-destructive mb-1">
                                      رسالة الخطأ:
                                    </p>
                                    <p className="text-xs text-destructive bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
                                      {log.error_message}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-3">
            صفحة {page} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
