'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FileText } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';

interface PortalInvoice {
  id: string;
  invoice_number: string;
  project_name: string | null;
  status: string;
  currency: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  issue_date: string;
  due_date: string | null;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  sent: { label: 'مرسلة', variant: 'default' },
  paid: { label: 'مدفوعة', variant: 'secondary' },
  partially_paid: { label: 'مدفوعة جزئيا', variant: 'outline' },
  overdue: { label: 'متأخرة', variant: 'destructive' },
};

export default function PortalInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/portal/invoices?${params}`);
      const json = await res.json();
      if (json.data) setInvoices(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الفواتير</h1>
        <p className="text-muted-foreground text-sm mt-1">عرض فواتيرك وسجل المدفوعات</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الحالات</SelectItem>
            <SelectItem value="sent">مرسلة</SelectItem>
            <SelectItem value="paid">مدفوعة</SelectItem>
            <SelectItem value="partially_paid">مدفوعة جزئيا</SelectItem>
            <SelectItem value="overdue">متأخرة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-5">
              <FileText className="h-8 w-8 text-orange-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">لا توجد فواتير</h2>
            <p className="text-muted-foreground text-sm">لم يتم إرسال فواتير إليك بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const s = STATUS_MAP[inv.status] || { label: inv.status, variant: 'secondary' as const };
            return (
              <Card
                key={inv.id}
                className="cursor-pointer hover:border-orange-300 transition-colors"
                onClick={() => router.push(`/portal/invoices/${inv.id}`)}
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-medium">{inv.invoice_number}</span>
                      <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{inv.project_name || 'بدون مشروع'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.issue_date, 'dd-MM-yyyy')}
                      {inv.due_date && ` - ${formatDate(inv.due_date, 'dd-MM-yyyy')}`}
                    </p>
                  </div>
                  <div className="text-end space-y-1">
                    <p className="font-mono font-bold text-orange-600">{formatCurrency(inv.total, inv.currency)}</p>
                    {inv.amount_due > 0 && inv.amount_due < inv.total && (
                      <p className="text-xs text-muted-foreground">
                        المتبقي: {formatCurrency(inv.amount_due, inv.currency)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
