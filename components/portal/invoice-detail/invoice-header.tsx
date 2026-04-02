'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';

interface InvoiceHeaderProps {
  invoice: any;
  s: { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' };
}

export function InvoiceHeader({ invoice, s }: InvoiceHeaderProps) {
  return (
    <CardHeader className="text-center border-b">
      {invoice.company_logo && (
        <img src={invoice.company_logo} alt="Logo" className="h-12 mx-auto mb-2 object-contain" />
      )}
      <CardTitle className="text-xl text-portal">{invoice.company_name || 'PYRAMEDIA X'}</CardTitle>
      <p className="text-xs text-muted-foreground">FOR AI SOLUTIONS</p>
    </CardHeader>
  );
}

export function InvoiceInfo({ invoice, s }: InvoiceHeaderProps) {
  return (
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
  );
}
