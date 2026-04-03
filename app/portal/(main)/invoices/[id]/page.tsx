'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ChevronRight, Download, CreditCard, Loader2 } from 'lucide-react';
import { generateInvoicePDF } from '@/lib/pdf/invoice-pdf';
import { toast } from 'sonner';
import { InvoiceHeader, InvoiceInfo } from '@/components/portal/invoice-detail/invoice-header';
import { InvoiceTable, InvoiceTotals } from '@/components/portal/invoice-detail/invoice-table';
import { InvoicePayments } from '@/components/portal/invoice-detail/invoice-payments';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  sent: { label: 'مرسلة', variant: 'default' },
  paid: { label: 'مدفوعة', variant: 'secondary' },
  partially_paid: { label: 'مدفوعة جزئيا', variant: 'outline' },
  overdue: { label: 'متأخرة', variant: 'destructive' },
};

export default function PortalInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    const fetchInvoice = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/portal/invoices/${params.id}`);
        const json = await res.json();
        if (json.data) setInvoice(json.data);
      } catch {
        toast.error('فشل في تحميل تفاصيل الفاتورة');
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

  const handleDownloadPDF = async () => {
    await generateInvoicePDF(invoice);
    toast.success('تم تحميل ملف PDF');
  };

  const s = STATUS_MAP[invoice.status] || { label: invoice.status, variant: 'secondary' as const };
  const canPay = ['sent', 'partially_paid', 'overdue'].includes(invoice.status) && invoice.amount_due > 0;

  const handlePay = async () => {
    setPaying(true);
    try {
      const res = await fetch(`/api/portal/invoices/${invoice.id}/pay`, { method: 'POST' });
      const json = await res.json();
      if (json.data?.checkout_url) {
        window.location.href = json.data.checkout_url;
      } else {
        toast.error(json.error || 'حدث خطأ أثناء إنشاء جلسة الدفع');
        setPaying(false);
      }
    } catch {
      toast.error('حدث خطأ في الاتصال');
      setPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/portal/invoices')} className="gap-1">
          <ChevronRight className="h-4 w-4" /> العودة للفواتير
        </Button>
        <div className="flex items-center gap-2">
          {canPay && (
            <Button size="sm" className="gap-2 bg-green-600 hover:bg-green-700" onClick={handlePay} disabled={paying}>
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {paying ? 'جاري التحويل...' : 'ادفع الآن'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4" />
            تحميل PDF
          </Button>
        </div>
      </div>

      <Card className="max-w-[800px] mx-auto">
        <InvoiceHeader invoice={invoice} s={s} />
        <CardContent className="p-6 space-y-6">
          <InvoiceInfo invoice={invoice} s={s} />
          {/* ... (keep remaining parts as is or further simplify) ... */}
          <Separator />
          <InvoiceTable items={invoice.items} currency={invoice.currency} />
          <InvoiceTotals invoice={invoice} />
          <InvoicePayments payments={invoice.payments} currency={invoice.currency} />
        </CardContent>
      </Card>
    </div>
  );
}
