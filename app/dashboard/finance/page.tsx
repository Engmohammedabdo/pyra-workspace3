'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FinanceSummaryCards } from '@/components/dashboard/finance-overview/FinanceSummaryCards';
import { FinanceSubscriptions } from '@/components/dashboard/finance-overview/FinanceSubscriptions';
import { RevenueExpenseChart } from '@/components/finance/RevenueExpenseChart';
import { ExpenseBarChart } from '@/components/finance/ExpenseBarChart';
import { Wallet, TrendingUp, DollarSign, Receipt, ChevronLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import Link from 'next/link';

export default function FinanceDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const fetchData = () => {
    fetch('/api/finance/dashboard')
      .then(res => res.json())
      .then(res => { if (res.data) setData(res.data); else if (res.summary) setData(res); })
      .catch(() => toast.error('فشل في تحميل البيانات المالية'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <div className="space-y-6"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>;
  if (!data) return <div className="flex items-center justify-center h-64">لا توجد بيانات</div>;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center"><Wallet className="h-5 w-5 text-orange-500" /></div>
        <div>
          <h1 className="text-2xl font-bold">الإدارة المالية</h1>
          <p className="text-muted-foreground text-sm">ملخص {new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>
      <FinanceSummaryCards summary={data.summary} />
      {(data.summary.outstanding > 0 || data.summary.overdue > 0) && (
        <Card><CardContent className="p-5 flex items-center justify-between"><div className="flex items-center gap-3"><Receipt className="h-5 w-5 text-orange-500" /> <div><p className="text-sm">فلوس مستنياك</p><p className="font-bold">{formatCurrency(data.summary.outstanding)}</p></div></div> <Link href="/dashboard/invoices"><Button variant="outline" size="sm">عرض الفواتير <ChevronLeft className="h-4 w-4 ms-1" /></Button></Link></CardContent></Card>
      )}
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> الإيرادات مقابل المصاريف</CardTitle></CardHeader><CardContent><RevenueExpenseChart data={data.monthly_chart} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> وين راحت الفلوس؟</CardTitle></CardHeader><CardContent><ExpenseBarChart data={data.expense_pie} /></CardContent></Card>
      <FinanceSubscriptions {...{ dueSubscriptions: data.due_subscriptions, upcomingRenewals: data.upcoming_renewals, summary: data.summary, onApprove: (s) => console.log('approve', s.id), onReject: (s) => console.log('reject', s.id), approvingId, rejectingId }} />
    </div>
  );
}
