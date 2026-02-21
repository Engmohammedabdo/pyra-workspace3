'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, Download } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';

interface InvoiceItem {
  id: string;
  sort_order: number;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  method: string | null;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  project_name: string | null;
  status: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  issue_date: string;
  due_date: string | null;
  notes: string | null;
  company_name: string | null;
  company_logo: string | null;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  bank_details: {
    bank: string;
    account_name: string;
    account_no: string;
    iban: string;
  } | null;
  items: InvoiceItem[];
  payments: Payment[];
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  sent: { label: 'مرسلة', variant: 'default' },
  paid: { label: 'مدفوعة', variant: 'secondary' },
  partially_paid: { label: 'مدفوعة جزئيا', variant: 'outline' },
  overdue: { label: 'متأخرة', variant: 'destructive' },
};

const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  cheque: 'شيك',
  card: 'بطاقة',
  online: 'دفع إلكتروني',
};

const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default function PortalInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvoice = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/portal/invoices/${params.id}`);
        const json = await res.json();
        if (json.data) setInvoice(json.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (params.id) fetchInvoice();
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/portal/invoices')} className="gap-1">
          <ChevronRight className="h-4 w-4" /> العودة للفواتير
        </Button>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <h2 className="text-xl font-semibold mb-2">الفاتورة غير موجودة</h2>
            <p className="text-muted-foreground text-sm">لم يتم العثور على الفاتورة المطلوبة</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = STATUS_MAP[invoice.status] || { label: invoice.status, variant: 'secondary' as const };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/portal/invoices')} className="gap-1">
          <ChevronRight className="h-4 w-4" /> العودة للفواتير
        </Button>
        <Button variant="outline" size="sm" className="gap-2" asChild>
          <a href={`/api/portal/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4" />
            تحميل PDF
          </a>
        </Button>
      </div>

      <Card className="max-w-[800px] mx-auto">
        <CardHeader className="text-center border-b">
          {invoice.company_logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={invoice.company_logo} alt="Logo" className="h-12 mx-auto mb-2 object-contain" />
          )}
          <CardTitle className="text-xl text-orange-600">{invoice.company_name || 'PYRAMEDIA X'}</CardTitle>
          <p className="text-xs text-muted-foreground">FOR AI SOLUTIONS</p>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Invoice info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted-foreground block">رقم الفاتورة</span>
              <span className="font-mono">{invoice.invoice_number}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">الحالة</span>
              <Badge variant={s.variant} className="text-[10px] mt-0.5">{s.label}</Badge>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">تاريخ الإصدار</span>
              <span>{formatDate(invoice.issue_date, 'dd-MM-yyyy')}</span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">تاريخ الاستحقاق</span>
              <span>{invoice.due_date ? formatDate(invoice.due_date, 'dd-MM-yyyy') : '--'}</span>
            </div>
          </div>

          {/* Project & Client info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {invoice.project_name && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">المشروع</p>
                <p className="text-sm font-medium">{invoice.project_name}</p>
              </div>
            )}
            {(invoice.client_name || invoice.client_company) && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">العميل</p>
                <p className="text-sm font-medium">{invoice.client_name || invoice.client_company}</p>
                {invoice.client_email && (
                  <p className="text-xs text-muted-foreground">{invoice.client_email}</p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className="p-2 text-start w-10">#</th>
                  <th className="p-2 text-start">الوصف</th>
                  <th className="p-2 text-start w-16">الكمية</th>
                  <th className="p-2 text-start w-24">السعر</th>
                  <th className="p-2 text-start w-24">المجموع</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, idx) => (
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

          {/* Totals */}
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
                <span className="font-mono text-orange-600" dir="ltr">{fmtNum(invoice.total)} {invoice.currency}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">المدفوع</span>
                <span className="font-mono text-green-600" dir="ltr">{fmtNum(invoice.amount_paid)} {invoice.currency}</span>
              </div>
              <div className={`flex justify-between text-sm font-semibold ${invoice.status === 'overdue' ? 'text-red-600' : ''}`}>
                <span>المتبقي</span>
                <span className="font-mono" dir="ltr">{fmtNum(invoice.amount_due)} {invoice.currency}</span>
              </div>
            </div>
          </div>

          {/* Payment history */}
          {invoice.payments && invoice.payments.length > 0 && (
            <>
              <Separator />
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
                      {invoice.payments.map((payment) => (
                        <tr key={payment.id} className="border-b">
                          <td className="p-2">{formatDate(payment.payment_date, 'dd-MM-yyyy')}</td>
                          <td className="p-2 font-mono text-green-600" dir="ltr">
                            {fmtNum(payment.amount)} {invoice.currency}
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
            </>
          )}

          {/* Bank details */}
          {invoice.bank_details?.bank && (
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">البيانات البنكية</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>البنك: {invoice.bank_details.bank}</span>
                <span>اسم الحساب: {invoice.bank_details.account_name}</span>
                <span>رقم الحساب: {invoice.bank_details.account_no}</span>
                <span>IBAN: {invoice.bank_details.iban}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm">{invoice.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
