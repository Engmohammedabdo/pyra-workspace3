'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Plus, Receipt, Loader2, FileText, Pencil, CheckCircle2, Trash2 } from 'lucide-react';
import Link from 'next/link';

const MILESTONE_STATUS_MAP: any = {
  pending: { label: 'قيد الانتظار', variant: 'secondary' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'outline', className: 'border-green-500 text-green-700 dark:text-green-400' },
  invoiced: { label: 'تم الفوترة', variant: 'outline', className: 'border-blue-500 text-blue-700 dark:text-blue-400' },
};

export function MilestonesSection({
  loading, milestones, currency, progressPercentage, onAdd, onEdit, onMarkComplete, onGenerateInvoice, onDelete, generatingInvoice
}: { loading: boolean, milestones: any[], currency: string, progressPercentage: number, onAdd: () => void, onEdit: (m: any) => void, onMarkComplete: (m: any) => void, onGenerateInvoice: (m: any) => void, onDelete: (m: any) => void, generatingInvoice: any }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">مراحل العقد</CardTitle>
          <Button size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4 me-1" />
            إضافة مرحلة
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {milestones.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>نسبة الإنجاز</span>
              <span>{Math.min(progressPercentage, 100).toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(progressPercentage, 100)} className="h-2" />
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : milestones.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="لا توجد مراحل بعد"
            description="أضف مراحل لتتبع تقدم العقد وإنشاء الفواتير تلقائياً"
          />
        ) : (
          <div className="space-y-2">
            {milestones.map((m: any) => {
              const statusInfo = MILESTONE_STATUS_MAP[m.status] || MILESTONE_STATUS_MAP.pending;
              const isGenerating = generatingInvoice === m.id;

              return (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{m.title}</span>
                      <Badge variant={statusInfo.variant} className={statusInfo.className}>{statusInfo.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{m.percentage}%</span>
                      <span>{m.amount.toLocaleString()} {currency}</span>
                      {m.due_date && <span>{m.due_date}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(m.status === 'pending' || m.status === 'in_progress') && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(m)} aria-label="تعديل">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => onMarkComplete(m)} aria-label="تأكيد">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {m.status === 'completed' && (
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onGenerateInvoice(m)} disabled={isGenerating}>
                        {isGenerating ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 me-1" />}
                        إنشاء فاتورة
                      </Button>
                    )}
                    {m.status === 'invoiced' && m.invoice_id && (
                      <Link href={`/dashboard/invoices/${m.invoice_id}`}>
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-blue-600 hover:text-blue-700">
                          <FileText className="h-3.5 w-3.5 me-1" />
                          عرض الفاتورة
                        </Button>
                      </Link>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => onDelete(m)} disabled={m.status === 'invoiced'} aria-label="حذف">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
