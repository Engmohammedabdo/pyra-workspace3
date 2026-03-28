'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RevenueExpenseChart } from '@/components/finance/RevenueExpenseChart';
import { ExpenseBarChart } from '@/components/finance/ExpenseBarChart';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpCircle,
  ArrowDownCircle,
  Receipt,
  CreditCard,
  FileSignature,
  AlertTriangle,
  RefreshCw,
  Truck,
  ShoppingCart,
  FileCheck,
  PieChart,
  Target,
  CheckCircle2,
  Clock,
  ChevronLeft,
} from 'lucide-react';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';

/* ── Types ─────────────────────────────────────────── */

interface FinanceSummary {
  revenue_mtd: number;
  revenue_ytd: number;
  expenses_mtd: number;
  expenses_ytd: number;
  profit_mtd: number;
  profit_ytd: number;
  outstanding: number;
  outstanding_count: number;
  overdue: number;
  overdue_count: number;
  monthly_subs_cost: number;
  active_contracts: number;
}

interface MonthlyChart {
  month: string;
  revenue: number;
  expenses: number;
}

interface ExpensePie {
  name: string;
  value: number;
  color: string;
}

interface UpcomingRenewal {
  id: string;
  name: string;
  provider: string;
  cost: number;
  currency: string;
  next_renewal_date: string;
}

interface FinanceDashboardData {
  summary: FinanceSummary;
  monthly_chart: MonthlyChart[];
  expense_pie: ExpensePie[];
  upcoming_renewals: UpcomingRenewal[];
  due_subscriptions: UpcomingRenewal[];
}

/* ── Helpers ───────────────────────────────────────── */

function getDaysRemaining(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getMonthName(): string {
  return new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
}

function getProfitMargin(revenue: number, expenses: number): string {
  if (revenue === 0) return '0%';
  return `${Math.round(((revenue - expenses) / revenue) * 100)}%`;
}

/* ── Quick Link Card ───────────────────────────────── */

function QuickLinkCard({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link href={href} className="group">
      <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5 group-hover:border-orange-500/40">
        <CardContent className="flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center group-hover:bg-orange-500/20 transition-colors">
            <Icon className="h-5 w-5 text-orange-500" />
          </div>
          <span className="font-medium text-sm">{label}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ── Page ──────────────────────────────────────────── */

export default function FinanceDashboardPage() {
  const [data, setData] = useState<FinanceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchData = () => {
    fetch('/api/finance/dashboard')
      .then((res) => res.json())
      .then((res) => {
        if (res.data) setData(res.data);
        else if (res.summary) setData(res as FinanceDashboardData);
      })
      .catch(() => toast.error('فشل في تحميل البيانات المالية'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleApproveRenewal = async (subId: string) => {
    setApprovingId(subId);
    try {
      const res = await fetch(`/api/finance/subscriptions/${subId}/approve-renewal`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.data?.message || 'تمت الموافقة على التجديد');
        fetchData();
      } else {
        toast.error(json.error || 'فشل في الموافقة');
      }
    } catch { toast.error('فشل في الموافقة'); }
    finally { setApprovingId(null); }
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[250px]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        لا توجد بيانات مالية
      </div>
    );
  }

  const { summary, monthly_chart, expense_pie, upcoming_renewals, due_subscriptions } = data;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
          <Wallet className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">الإدارة المالية</h1>
          <p className="text-muted-foreground text-sm">ملخص {getMonthName()}</p>
        </div>
      </div>

      {/* ═══ Section 1: 3 KPI Cards ═══ */}
      <StaggerContainer className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* فلوس دخلت */}
        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-green-500/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">فلوس دخلت</span>
                <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <ArrowUpCircle className="h-5 w-5 text-green-600" />
                </div>
              </div>
              <p className="text-3xl font-bold font-mono text-green-600">
                {formatCurrency(summary.revenue_mtd)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                من بداية السنة: {formatCurrency(summary.revenue_ytd)}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* فلوس طلعت */}
        <StaggerItem>
          <Card className="transition-all duration-200 hover:shadow-md hover:border-red-500/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">فلوس طلعت</span>
                <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <ArrowDownCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
              <p className="text-3xl font-bold font-mono text-red-600">
                {formatCurrency(summary.expenses_mtd)}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                من بداية السنة: {formatCurrency(summary.expenses_ytd)}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>

        {/* الصافي */}
        <StaggerItem>
          <Card className={`transition-all duration-200 hover:shadow-md ${summary.profit_mtd >= 0 ? 'hover:border-green-500/30' : 'hover:border-red-500/30'}`}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">الصافي</span>
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${summary.profit_mtd >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  {summary.profit_mtd >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <p className={`text-3xl font-bold font-mono ${summary.profit_mtd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(summary.profit_mtd)}
                </p>
                {summary.revenue_mtd > 0 && (
                  <Badge variant={summary.profit_mtd >= 0 ? 'default' : 'destructive'} className="text-xs">
                    هامش {getProfitMargin(summary.revenue_mtd, summary.expenses_mtd)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                من بداية السنة: {formatCurrency(summary.profit_ytd)}
              </p>
            </CardContent>
          </Card>
        </StaggerItem>
      </StaggerContainer>

      {/* ═══ Section 2: فلوس مستنياك ═══ */}
      {(summary.outstanding > 0 || summary.overdue > 0) && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Receipt className="h-5 w-5 text-orange-500" />
                  <span className="font-semibold">فلوس مستنياك</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 rounded-lg bg-orange-50 dark:bg-orange-900/20 p-3">
                    <div>
                      <p className="text-sm text-muted-foreground">فواتير لسه ما اتدفعت</p>
                      <p className="text-lg font-bold font-mono text-orange-600">
                        {formatCurrency(summary.outstanding)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="ms-auto shrink-0">
                      {summary.outstanding_count} فاتورة
                    </Badge>
                  </div>
                  {summary.overdue > 0 && (
                    <div className="flex items-center gap-3 rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
                      <div>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          منها متأخرة
                        </p>
                        <p className="text-lg font-bold font-mono text-red-600">
                          {formatCurrency(summary.overdue)}
                        </p>
                      </div>
                      <Badge variant="destructive" className="ms-auto shrink-0">
                        {summary.overdue_count} فاتورة
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              <Link href="/dashboard/invoices" className="shrink-0 ms-4 hidden sm:block">
                <Button variant="outline" size="sm">
                  عرض الفواتير
                  <ChevronLeft className="h-4 w-4 ms-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Section 3: Revenue vs Expenses Chart (full width) ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            الإيرادات مقابل المصاريف (آخر 12 شهر)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueExpenseChart data={monthly_chart} />
        </CardContent>
      </Card>

      {/* ═══ Section 4: وين راحت الفلوس ═══ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            وين راحت الفلوس؟
          </CardTitle>
          <p className="text-xs text-muted-foreground">توزيع المصاريف — {getMonthName()}</p>
        </CardHeader>
        <CardContent>
          <ExpenseBarChart data={expense_pie} />
        </CardContent>
      </Card>

      {/* ═══ Section 5: تجديدات واشتراكات ═══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Due subscriptions needing approval */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              اشتراكات تحتاج موافقتك
            </CardTitle>
          </CardHeader>
          <CardContent>
            {due_subscriptions && due_subscriptions.length > 0 ? (
              <div className="space-y-2">
                {due_subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-900/10 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{sub.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(sub.cost, sub.currency)} · {sub.provider}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleApproveRenewal(sub.id)}
                      disabled={approvingId === sub.id}
                      className="bg-orange-600 hover:bg-orange-700 text-white shrink-0 ms-2"
                    >
                      {approvingId === sub.id ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin me-1" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5 me-1" />
                      )}
                      {approvingId === sub.id ? 'جارٍ...' : 'موافقة'}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                لا توجد اشتراكات تحتاج موافقة
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming renewals + monthly cost */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              تجديدات قادمة
            </CardTitle>
            {summary.monthly_subs_cost > 0 && (
              <p className="text-xs text-muted-foreground">
                التكلفة الشهرية للاشتراكات: <span className="font-mono font-bold">{formatCurrency(summary.monthly_subs_cost)}</span>
              </p>
            )}
          </CardHeader>
          <CardContent>
            {upcoming_renewals && upcoming_renewals.length > 0 ? (
              <div className="space-y-2">
                {upcoming_renewals.map((renewal) => {
                  const days = getDaysRemaining(renewal.next_renewal_date);
                  return (
                    <div
                      key={renewal.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{renewal.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {renewal.provider}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ms-3">
                        <span className="font-mono text-sm font-bold">
                          {formatCurrency(renewal.cost, renewal.currency)}
                        </span>
                        <Badge variant={days <= 2 ? 'destructive' : 'secondary'}>
                          {days <= 0 ? 'اليوم' : days === 1 ? 'غداً' : `${days} يوم`}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                لا توجد تجديدات قريبة
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Section 6: Quick Links ═══ */}
      <StaggerContainer className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/expenses" label="المصاريف" icon={ArrowDownCircle} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/suppliers" label="الموردين" icon={Truck} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/purchase-orders" label="أوامر الشراء" icon={ShoppingCart} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/credit-notes" label="إشعارات دائنة" icon={FileCheck} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/subscriptions" label="الاشتراكات" icon={RefreshCw} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/contracts" label="العقود" icon={FileSignature} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/cards" label="البطاقات" icon={CreditCard} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/reports" label="التقارير المالية" icon={PieChart} />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard href="/dashboard/finance/targets" label="أهداف الإيرادات" icon={Target} />
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
