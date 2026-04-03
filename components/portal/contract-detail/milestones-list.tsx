import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { Receipt, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export function MilestonesList({ milestones, contract }: { milestones: any[]; contract: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {/* Use specific icons */}
          تقدم المراحل
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {milestones.map((m: any) => {
            const milestoneStatusMap: Record<string, { label: string; icon: any; color: string }> = {
              completed: { label: 'مكتمل', icon: CheckCircle, color: 'text-emerald-500 dark:text-emerald-400' },
              invoiced: { label: 'مفوتر', icon: Receipt, color: 'text-blue-500 dark:text-blue-400' },
              in_progress: { label: 'قيد التنفيذ', icon: Clock, color: 'text-amber-500 dark:text-amber-400' },
              pending: { label: 'قيد الانتظار', icon: Clock, color: 'text-muted-foreground' },
            };
            const ms = milestoneStatusMap[m.status] || milestoneStatusMap.pending;
            const MsIcon = ms.icon;
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3 bg-card">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted shrink-0">
                  <MsIcon className={`h-4 w-4 ${ms.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{m.title}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">{ms.label}</Badge>
                  </div>
                  {m.invoice_number && (
                    <Link href={`/portal/invoices/${m.invoice_id}`}>
                      <span className="text-xs text-portal hover:underline mt-0.5 inline-block">
                        فاتورة: {m.invoice_number}
                      </span>
                    </Link>
                  )}
                </div>
                <p className="font-mono text-sm font-medium">{formatCurrency(m.amount, contract.currency)}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
