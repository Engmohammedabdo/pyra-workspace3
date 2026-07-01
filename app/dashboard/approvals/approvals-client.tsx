'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ClipboardCheck, Calendar, Receipt, Clock, Check, X, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { TeamApprovalsResponse } from '@/app/api/approvals/team/route';

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'سنوية',
  sick: 'مرضية',
  personal: 'شخصية',
  unpaid: 'بدون راتب',
  emergency: 'طارئة',
};

interface RejectDialogState {
  open: boolean;
  kind: 'leave' | 'expense' | 'timesheet';
  id: string;
  label: string;
}

export default function ApprovalsClient() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<TeamApprovalsResponse>({
    queryKey: ['approvals-team'],
    queryFn: () => fetchAPI('/api/approvals/team'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const [rejectDialog, setRejectDialog] = useState<RejectDialogState>({
    open: false,
    kind: 'leave',
    id: '',
    label: '',
  });
  const [rejectNote, setRejectNote] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals-team'] });
    queryClient.invalidateQueries({ queryKey: ['my-work'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
  };

  const leaveMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: 'approved' | 'rejected'; note?: string }) =>
      mutateAPI(`/api/leave/${id}`, 'PATCH', { status, review_note: note }),
    onSuccess: (_d, vars) => {
      toast.success(vars.status === 'approved' ? 'تمت الموافقة على الإجازة' : 'تم رفض الإجازة');
      invalidate();
    },
    onError: () => toast.error('حدث خطأ — حاول مرة أخرى'),
  });

  const expenseMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      mutateAPI(`/api/finance/expenses/${id}`, 'PATCH', { action, approval_notes: note }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === 'approve' ? 'تمت الموافقة على المصروف' : 'تم رفض المصروف');
      invalidate();
    },
    onError: () => toast.error('حدث خطأ — حاول مرة أخرى'),
  });

  const timesheetMutation = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      mutateAPI(`/api/dashboard/timesheet-periods/${id}`, 'PATCH', { action, rejection_note: note }),
    onSuccess: (_d, vars) => {
      toast.success(vars.action === 'approve' ? 'تم اعتماد الفترة' : 'تم رفض الفترة');
      invalidate();
    },
    onError: () => toast.error('حدث خطأ — حاول مرة أخرى'),
  });

  const openRejectDialog = (kind: RejectDialogState['kind'], id: string, label: string) => {
    setRejectNote('');
    setRejectDialog({ open: true, kind, id, label });
  };

  const submitReject = () => {
    const { kind, id } = rejectDialog;
    if (kind === 'leave') leaveMutation.mutate({ id, status: 'rejected', note: rejectNote });
    if (kind === 'expense') expenseMutation.mutate({ id, action: 'reject', note: rejectNote });
    if (kind === 'timesheet') timesheetMutation.mutate({ id, action: 'reject', note: rejectNote });
    setRejectDialog((s) => ({ ...s, open: false }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data?.is_manager) {
    return (
      <Card className="overflow-hidden">
        <EmptyState
          icon={ClipboardCheck}
          title="مفيش موظفين تحت إدارتك"
          description="لما يكون عندك موظفين تابعينلك، طلباتهم هتظهر هنا للموافقة"
        />
      </Card>
    );
  }

  const total = data.leave.length + data.expense.length + data.timesheet.length;
  const isPending =
    leaveMutation.isPending || expenseMutation.isPending || timesheetMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            الموافقات
          </h1>
          <p className="text-muted-foreground">
            {total > 0
              ? `عندك ${total} طلب مستني موافقتك`
              : 'مفيش طلبات مستنياك دلوقتي'}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <Card className="overflow-hidden">
          <EmptyState
            icon={Check}
            title="كل الطلبات اتراجعت 🎉"
            description="لما حد من فريقك يبعت طلب، هيظهر هنا"
          />
        </Card>
      ) : (
        <Tabs defaultValue="leave" className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-lg">
            <TabsTrigger value="leave" className="gap-2">
              <Calendar className="h-4 w-4" />
              الإجازات
              {data.leave.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{data.leave.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="expense" className="gap-2">
              <Receipt className="h-4 w-4" />
              المصاريف
              {data.expense.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{data.expense.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="timesheet" className="gap-2">
              <Clock className="h-4 w-4" />
              ساعات العمل
              {data.timesheet.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5">{data.timesheet.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* LEAVE TAB */}
          <TabsContent value="leave" className="mt-6">
            {data.leave.length === 0 ? (
              <Card className="overflow-hidden">
                <EmptyState icon={Calendar} title="مفيش طلبات إجازات مستنياك" />
              </Card>
            ) : (
              <div className="space-y-3">
                {data.leave.map((l) => (
                  <Card key={l.id} className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{l.display_name}</p>
                          <Badge variant="outline" className="text-xs">
                            {LEAVE_TYPE_LABELS[l.type] || l.type}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {l.days_count} يوم
                          </Badge>
                          {l.remaining_balance !== null && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs',
                                l.remaining_balance < l.days_count
                                  ? 'border-red-300 text-red-700 bg-red-500/10 dark:border-red-700/60 dark:text-red-400'
                                  : 'border-amber-300 text-amber-700 bg-amber-500/10 dark:border-amber-700/60 dark:text-amber-400',
                              )}
                            >
                              الرصيد المتبقي: {l.remaining_balance} يوم
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          من <span dir="ltr">{formatDate(l.start_date)}</span> إلى{' '}
                          <span dir="ltr">{formatDate(l.end_date)}</span>
                        </p>
                        {l.reason && (
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            &ldquo;{l.reason}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => openRejectDialog('leave', l.id, `إجازة ${l.display_name}`)}
                          className="gap-1"
                        >
                          <X className="h-4 w-4" />
                          رفض
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => leaveMutation.mutate({ id: l.id, status: 'approved' })}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="h-4 w-4" />
                          موافقة
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* EXPENSE TAB */}
          <TabsContent value="expense" className="mt-6">
            {data.expense.length === 0 ? (
              <Card className="overflow-hidden">
                <EmptyState icon={Receipt} title="مفيش مصاريف مستنياك" />
              </Card>
            ) : (
              <div className="space-y-3">
                {data.expense.map((e) => (
                  <Card key={e.id} className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">
                            {formatCurrency(e.amount, e.currency)}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {e.submitted_by_display}
                          </Badge>
                          {e.vendor && (
                            <Badge variant="secondary" className="text-xs">
                              {e.vendor}
                            </Badge>
                          )}
                        </div>
                        {e.description && (
                          <p className="text-sm text-muted-foreground mt-1 truncate">{e.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          تاريخ المصروف: <span dir="ltr">{formatDate(e.expense_date)}</span>
                        </p>
                        {e.receipt_url && (
                          <a
                            href={e.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 mt-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            عرض الفاتورة
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            openRejectDialog('expense', e.id, `مصروف ${formatCurrency(e.amount, e.currency)}`)
                          }
                          className="gap-1"
                        >
                          <X className="h-4 w-4" />
                          رفض
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => expenseMutation.mutate({ id: e.id, action: 'approve' })}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="h-4 w-4" />
                          موافقة
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TIMESHEET TAB */}
          <TabsContent value="timesheet" className="mt-6">
            {data.timesheet.length === 0 ? (
              <Card className="overflow-hidden">
                <EmptyState icon={Clock} title="مفيش جداول ساعات مستنياك" />
              </Card>
            ) : (
              <div className="space-y-3">
                {data.timesheet.map((t) => (
                  <Card key={t.id} className="p-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold">{t.display_name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {t.total_hours ?? 0} ساعة
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          الفترة: <span dir="ltr">{formatDate(t.period_start)}</span> →{' '}
                          <span dir="ltr">{formatDate(t.period_end)}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            openRejectDialog('timesheet', t.id, `جدول ${t.display_name}`)
                          }
                          className="gap-1"
                        >
                          <X className="h-4 w-4" />
                          رفض
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => timesheetMutation.mutate({ id: t.id, action: 'approve' })}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          <Check className="h-4 w-4" />
                          موافقة
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* REJECT DIALOG */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog((s) => ({ ...s, open }))}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>رفض {rejectDialog.label}</DialogTitle>
            <DialogDescription>
              اكتب سبب الرفض عشان الموظف يفهم ليه ويصلحه
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="السبب (اختياري)..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog((s) => ({ ...s, open: false }))}
            >
              إلغاء
            </Button>
            <Button
              onClick={submitReject}
              disabled={isPending}
              className={cn('gap-1.5', isPending && 'opacity-70')}
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
