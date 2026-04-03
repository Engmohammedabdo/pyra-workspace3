'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { CreditCard } from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants/statuses';

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
}

const PAYMENT_METHODS: Record<string, string> = PAYMENT_METHOD_LABELS;

export function PaymentHistory({ payments, currency }: { payments: Payment[]; currency: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> سجل المدفوعات
        </CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد مدفوعات مسجلة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">التاريخ</th>
                  <th className="text-start p-3 font-medium">المبلغ</th>
                  <th className="text-start p-3 font-medium">طريقة الدفع</th>
                  <th className="text-start p-3 font-medium">المرجع</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id} className="border-b">
                    <td className="p-3 text-muted-foreground">{formatDate(payment.payment_date)}</td>
                    <td className={`p-3 font-mono ${payment.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {payment.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(payment.amount), currency)}
                    </td>
                    <td className="p-3">{PAYMENT_METHODS[payment.method] || payment.method}</td>
                    <td className="p-3 text-muted-foreground">{payment.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
