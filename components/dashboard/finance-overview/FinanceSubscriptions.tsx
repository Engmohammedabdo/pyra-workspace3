'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function FinanceSubscriptions({
  dueSubscriptions,
  upcomingRenewals,
  summary,
  onApprove,
  onReject,
  approvingId,
  rejectingId
}: {
  dueSubscriptions: any[];
  upcomingRenewals: any[];
  summary: any;
  onApprove: (sub: any) => void;
  onReject: (sub: any) => void;
  approvingId: string | null;
  rejectingId: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><Clock className="h-5 w-5 text-orange-500" aria-hidden="true" /> اشتراكات تحتاج موافقتك</h3>
          {dueSubscriptions?.length > 0 ? (
            <div className="space-y-2">
              {dueSubscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/20 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{sub.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(sub.cost, sub.currency)} · {sub.provider}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ms-2">
                    <Button size="sm" variant="outline" onClick={() => onReject(sub)} disabled={rejectingId === sub.id || approvingId === sub.id}><XCircle className="h-3.5 w-3.5 me-1" /> رفض</Button>
                    <Button size="sm" onClick={() => onApprove(sub)} disabled={approvingId === sub.id || rejectingId === sub.id}><CheckCircle2 className="h-3.5 w-3.5 me-1" /> موافقة</Button>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={Clock} title="لا توجد اشتراكات تحتاج موافقة" className="py-4" />}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><RefreshCw className="h-5 w-5" aria-hidden="true" /> تجديدات قادمة</h3>
          {summary.monthly_subs_cost > 0 && <p className="text-xs text-muted-foreground mb-4">التكلفة الشهرية: {formatCurrency(summary.monthly_subs_cost)}</p>}
          {upcomingRenewals?.length > 0 ? (
            <div className="space-y-2">
              {upcomingRenewals.map((renewal) => (
                <div key={renewal.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{renewal.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{renewal.provider}</p>
                  </div>
                  <Badge variant="secondary">{renewal.next_renewal_date}</Badge>
                </div>
              ))}
            </div>
          ) : <EmptyState icon={RefreshCw} title="لا توجد تجديدات قريبة" className="py-4" />}
        </CardContent>
      </Card>
    </div>
  );
}
