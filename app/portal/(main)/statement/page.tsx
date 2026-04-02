'use client';

import { useState, useEffect, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { Receipt, FileText, CreditCard, Wallet, AlertTriangle, FileSignature } from 'lucide-react';
import { SummaryCard } from '@/components/portal/statement/SummaryCard';
import { FilterSection } from '@/components/portal/statement/FilterSection';
import { StatementTable } from '@/components/portal/statement/StatementTable';
import { UnbilledObligations } from '@/components/portal/statement/UnbilledObligations';

interface StatementEntry {
  date: string;
  type: 'invoice' | 'payment' | 'stripe_payment';
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  invoice_id?: string;
  currency: string;
}

interface StatementSummary {
  total_invoiced: number;
  total_paid: number;
  total_remaining: number;
  overdue_amount: number;
  unbilled_amount: number;
  invoice_count: number;
  payment_count: number;
}

interface UnbilledObligation {
  contract_id: string;
  contract_title: string;
  total_value: number;
  amount_billed: number;
  unbilled_amount: number;
  currency: string;
  pending_milestones: { title: string; amount: number }[];
}

interface StatementData {
  client: { name: string; company: string; email: string };
  summary: StatementSummary;
  entries: StatementEntry[];
  unbilled_obligations: UnbilledObligation[];
}

export default function PortalStatementPage() {
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/portal/statement?${params}`);
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch {
      toast.error('فشل في تحميل كشف الحساب');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <EmptyState icon={Receipt} title="لا يوجد كشف حساب" description="لم يتم العثور على بيانات مالية" />;
  }

  const { summary, entries, unbilled_obligations } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">كشف الحساب</h1>
        <p className="text-muted-foreground text-sm mt-1">ملخص شامل لحسابك المالي مع تفاصيل الفواتير والمدفوعات</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryCard icon={FileText} label="إجمالي الفواتير" value={summary.total_invoiced} subValue={`${summary.invoice_count} فاتورة`} colorClass="text-blue-500" bgClass="bg-blue-500/10" />
        <SummaryCard icon={CreditCard} label="المبلغ المدفوع" value={summary.total_paid} subValue={`${summary.payment_count} دفعة`} colorClass="text-emerald-600 dark:text-emerald-400" bgClass="bg-emerald-500/10" />
        <SummaryCard icon={Wallet} label="المبلغ المتبقي" value={summary.total_remaining} colorClass="text-orange-600 dark:text-orange-400" bgClass="bg-orange-500/10" />
        <SummaryCard icon={AlertTriangle} label="مبالغ متأخرة" value={summary.overdue_amount} colorClass="text-red-600 dark:text-red-400" bgClass="bg-red-500/10" />
        {summary.unbilled_amount > 0 && (
          <SummaryCard icon={FileSignature} label="مبالغ غير مفوترة" value={summary.unbilled_amount} subValue="من عقود قيد التنفيذ" colorClass="text-purple-600 dark:text-purple-400" bgClass="bg-purple-500/10" />
        )}
      </div>

      <FilterSection fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} />
      <StatementTable entries={entries} />
      <UnbilledObligations obligations={unbilled_obligations} />
    </div>
  );
}
