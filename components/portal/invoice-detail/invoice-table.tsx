import { Separator } from '@/components/ui/separator';

const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function InvoiceTable({ items, currency }: { items: any[]; currency: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-portal text-white">
            <th className="p-2 text-start w-10">#</th>
            <th className="p-2 text-start">الوصف</th>
            <th className="p-2 text-start w-16">الكمية</th>
            <th className="p-2 text-start w-24">السعر</th>
            <th className="p-2 text-start w-24">المجموع</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-b">
              <td className="p-2 text-muted-foreground">{idx + 1}</td>
              <td className="p-2">{item.description}</td>
              <td className="p-2 font-mono" dir="ltr">{item.quantity}</td>
              <td className="p-2 font-mono" dir="ltr">{fmtNum(item.rate)}</td>
              <td className="p-2 font-mono" dir="ltr">{fmtNum(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceTotals({ invoice }: { invoice: any }) {
  return (
    <div className="flex justify-end">
      <div className="w-72 space-y-2 border rounded-lg p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">المجموع الفرعي</span>
          <span className="font-mono" dir="ltr">{fmtNum(invoice.subtotal)} {invoice.currency}</span>
        </div>
        {invoice.tax_rate > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">ضريبة ({invoice.tax_rate}%)</span>
            <span className="font-mono" dir="ltr">{fmtNum(invoice.tax_amount)} {invoice.currency}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-bold">
          <span>الإجمالي</span>
          <span className="font-mono text-portal" dir="ltr">{fmtNum(invoice.total)} {invoice.currency}</span>
        </div>
        <Separator />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">المدفوع</span>
          <span className="font-mono text-green-600 dark:text-green-400" dir="ltr">{fmtNum(invoice.amount_paid)} {invoice.currency}</span>
        </div>
        <div className={`flex justify-between text-sm font-semibold ${invoice.status === 'overdue' ? 'text-red-600 dark:text-red-400' : ''}`}>
          <span>المتبقي</span>
          <span className="font-mono" dir="ltr">{fmtNum(invoice.amount_due)} {invoice.currency}</span>
        </div>
      </div>
    </div>
  );
}
