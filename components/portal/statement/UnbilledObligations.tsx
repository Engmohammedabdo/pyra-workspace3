'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import { FileSignature, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface UnbilledObligation {
  contract_id: string;
  contract_title: string;
  total_value: number;
  amount_billed: number;
  unbilled_amount: number;
  currency: string;
  pending_milestones: { title: string; amount: number }[];
}

export function UnbilledObligations({ obligations }: { obligations: UnbilledObligation[] }) {
  const router = useRouter();

  if (!obligations || obligations.length === 0) return null;

  return (
    <Card className="border-purple-500/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-purple-500" />
          التزامات تعاقدية غير مفوترة
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          مبالغ من عقود قيد التنفيذ لم يتم إصدار فواتير لها بعد
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {obligations.map((obligation) => (
            <div key={obligation.contract_id} className="border rounded-lg p-4 bg-muted/30">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <button
                    onClick={() => router.push(`/portal/contracts/${obligation.contract_id}`)}
                    className="font-medium text-portal hover:underline"
                  >
                    {obligation.contract_title}
                  </button>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>قيمة العقد: {formatCurrency(obligation.total_value, obligation.currency)}</span>
                    <span>تم فوترة: {formatCurrency(obligation.amount_billed, obligation.currency)}</span>
                  </div>
                </div>
                <div className="text-end">
                  <p className="text-xs text-muted-foreground">المتبقي</p>
                  <p className="text-lg font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400">
                    {formatCurrency(obligation.unbilled_amount, obligation.currency)}
                  </p>
                </div>
              </div>

              <div className="w-full bg-muted rounded-full h-2 mb-3">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min((obligation.amount_billed / obligation.total_value) * 100, 100)}%`,
                  }}
                />
              </div>

              {obligation.pending_milestones.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">مراحل معلّقة:</p>
                  {obligation.pending_milestones.map((ms, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-background rounded-md px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{ms.title}</span>
                      </div>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {formatCurrency(ms.amount, obligation.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
