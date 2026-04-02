import { formatDate } from '@/lib/utils/format';
const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  cheque: 'شيك',
  card: 'بطاقة',
  credit_card: 'بطاقة ائتمان',
  online: 'دفع إلكتروني',
  credit_note: 'إشعار دائن (رد)',
  stripe: 'Stripe',
  refund: 'استرداد',
};

export function InvoicePayments({ payments, currency }: { payments: any[]; currency: string }) {
  if (!payments || payments.length === 0) return null;
  return (
    <div>
      <p className="text-sm font-semibold mb-3">سجل المدفوعات</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-2 text-start">التاريخ</th>
              <th className="p-2 text-start">المبلغ</th>
              <th className="p-2 text-start">طريقة الدفع</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b">
                <td className="p-2">{formatDate(payment.payment_date, 'dd-MM-yyyy')}</td>
                <td className={`p-2 font-mono ${payment.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} dir="ltr">
                  {payment.amount < 0 ? '-' : '+'}{fmtNum(Math.abs(payment.amount))} {currency}
                </td>
                <td className="p-2">
                  {payment.method ? (PAYMENT_METHODS[payment.method] || payment.method) : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
