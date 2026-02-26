'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, FileText, Receipt, Briefcase, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface ClientInfo {
  id: string;
  name: string;
  company: string;
  email: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
}

interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  method: string;
}

interface Contract {
  id: string;
  title: string;
  total_value: number;
  status: string;
  amount_billed: number;
  amount_collected: number;
}

interface Summary {
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  total_overdue: number;
  contract_value: number;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'مسودة', variant: 'secondary' },
  sent: { label: 'مرسلة', variant: 'outline' },
  paid: { label: 'مدفوعة', variant: 'default' },
  partially_paid: { label: 'مدفوعة جزئياً', variant: 'outline' },
  overdue: { label: 'متأخرة', variant: 'destructive' },
  cancelled: { label: 'ملغاة', variant: 'secondary' },
};

const CONTRACT_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'مسودة', variant: 'secondary' },
  active: { label: 'نشط', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'default' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
  paused: { label: 'متوقف', variant: 'outline' },
};

const METHOD_MAP: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  cheque: 'شيك',
  credit_card: 'بطاقة ائتمان',
  online: 'دفع إلكتروني',
  other: 'أخرى',
};

export default function ClientStatementPage() {
  const params = useParams();
  const clientId = params.clientId as string;

  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total_invoiced: 0,
    total_paid: 0,
    total_outstanding: 0,
    total_overdue: 0,
    contract_value: 0,
  });

  useEffect(() => {
    if (!clientId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/finance/client-statement/${clientId}`);
        const json = await res.json();
        if (json.data) {
          setClient(json.data.client);
          setInvoices(json.data.invoices || []);
          setPayments(json.data.payments || []);
          setContracts(json.data.contracts || []);
          setSummary(json.data.summary);
        } else {
          toast.error(json.error || 'فشل في تحميل كشف الحساب');
        }
      } catch {
        toast.error('فشل في تحميل كشف الحساب');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [clientId]);

  // Build a map from invoice_id to invoice_number for payment references
  const invoiceNumberMap: Record<string, string> = {};
  invoices.forEach(inv => { invoiceNumberMap[inv.id] = inv.invoice_number; });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">
          {loading ? (
            <Skeleton className="h-8 w-64 inline-block" />
          ) : (
            <>كشف حساب العميل: {client?.company || client?.name || '—'}</>
          )}
        </h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-8 w-28" /></CardContent></Card>
        )) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">إجمالي الفواتير</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(summary.total_invoiced)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">إجمالي المدفوع</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{formatCurrency(summary.total_paid)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">المستحق</p>
                <p className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(summary.total_outstanding)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  {summary.total_overdue > 0 && <AlertTriangle className="h-4 w-4 text-red-600" />}
                  المتأخر
                </p>
                <p className={`text-2xl font-bold mt-1 ${summary.total_overdue > 0 ? 'text-red-600' : ''}`}>
                  {formatCurrency(summary.total_overdue)}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Invoices Table */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> الفواتير
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-medium">#</th>
                <th className="text-start p-3 font-medium">رقم الفاتورة</th>
                <th className="text-start p-3 font-medium">التاريخ</th>
                <th className="text-start p-3 font-medium">الإجمالي</th>
                <th className="text-start p-3 font-medium">المدفوع</th>
                <th className="text-start p-3 font-medium">المستحق</th>
                <th className="text-start p-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b">{Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                ))}</tr>
              )) : invoices.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">لا توجد فواتير</td></tr>
              ) : invoices.map((inv, idx) => {
                const st = STATUS_MAP[inv.status] || { label: inv.status, variant: 'secondary' as const };
                return (
                  <tr key={inv.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground">{idx + 1}</td>
                    <td className="p-3 font-medium">
                      <Link href={`/dashboard/invoices/${inv.id}`} className="text-primary hover:underline">
                        {inv.invoice_number}
                      </Link>
                    </td>
                    <td className="p-3 text-muted-foreground">{formatDate(inv.issue_date)}</td>
                    <td className="p-3 font-mono">{formatCurrency(inv.total)}</td>
                    <td className="p-3 font-mono text-green-600">{formatCurrency(inv.amount_paid)}</td>
                    <td className="p-3 font-mono text-orange-600">{formatCurrency(inv.amount_due)}</td>
                    <td className="p-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payments Table */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5" /> المدفوعات
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-medium">التاريخ</th>
                <th className="text-start p-3 font-medium">المبلغ</th>
                <th className="text-start p-3 font-medium">طريقة الدفع</th>
                <th className="text-start p-3 font-medium">مرجع الفاتورة</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b">{Array.from({ length: 4 }).map((_, j) => (
                  <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                ))}</tr>
              )) : payments.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">لا توجد مدفوعات</td></tr>
              ) : payments.map(p => (
                <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-muted-foreground">{formatDate(p.payment_date)}</td>
                  <td className="p-3 font-mono text-green-600">{formatCurrency(p.amount)}</td>
                  <td className="p-3">{METHOD_MAP[p.method] || p.method}</td>
                  <td className="p-3 text-muted-foreground">{invoiceNumberMap[p.invoice_id] || p.invoice_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Contracts Table */}
      <Card>
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Briefcase className="h-5 w-5" /> العقود
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-medium">العنوان</th>
                <th className="text-start p-3 font-medium">القيمة</th>
                <th className="text-start p-3 font-medium">الحالة</th>
                <th className="text-start p-3 font-medium">المفوتر</th>
                <th className="text-start p-3 font-medium">المحصّل</th>
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 2 }).map((_, i) => (
                <tr key={i} className="border-b">{Array.from({ length: 5 }).map((_, j) => (
                  <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                ))}</tr>
              )) : contracts.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد عقود</td></tr>
              ) : contracts.map(c => {
                const st = CONTRACT_STATUS_MAP[c.status] || { label: c.status, variant: 'secondary' as const };
                return (
                  <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{c.title || '—'}</td>
                    <td className="p-3 font-mono">{formatCurrency(c.total_value)}</td>
                    <td className="p-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                    <td className="p-3 font-mono">{formatCurrency(c.amount_billed)}</td>
                    <td className="p-3 font-mono text-green-600">{formatCurrency(c.amount_collected)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
