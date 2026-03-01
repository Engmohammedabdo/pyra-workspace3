'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RevenueExpenseChart } from '@/components/finance/RevenueExpenseChart';
import { ExpenseCategoryPieChart } from '@/components/finance/ExpenseCategoryPieChart';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  CreditCard,
  FileSignature,
  AlertTriangle,
  RefreshCw,
  ArrowDownCircle,
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
  overdue: number;
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
}

/* ── Helpers ───────────────────────────────────────── */

function getDaysRemaining(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getRenewalBadgeVariant(days: number): 'destructive' | 'secondary' | 'outline' {
  if (days <= 7) return 'destructive';
  if (days <= 30) return 'secondary';
  return 'outline';
}

/* ── KPI Card ──────────────────────────────────────── */

function KpiCard({
  title,
  value,
  icon: Icon,
  colorClass,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}) {
  return (
    <Card className="transition-all duration-200 hover:shadow-md hover:border-orange-500/30 hover:-translate-y-0.5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
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

  useEffect(() => {
    fetch('/api/finance/dashboard')
      .then((res) => res.json())
      .then((res) => {
        if (res.data) {
          setData(res.data);
        } else if (res.summary) {
          setData(res as FinanceDashboardData);
        }
      })
      .catch((err) => {
        console.error('Failed to load finance dashboard:', err);
        toast.error('فشل في تحميل البيانات المالية');
      })
      .finally(() => setLoading(false));
  }, []);

  /* ── Loading State ── */
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[400px] lg:col-span-2" />
          <Skeleton className="h-[400px]" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
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

  const { summary, monthly_chart, expense_pie, upcoming_renewals } = data;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* ═══ Header ═══ */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
          <Wallet className="h-5 w-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">الإدارة المالية</h1>
          <p className="text-muted-foreground text-sm">نظرة عامة على الوضع المالي</p>
        </div>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <StaggerContainer className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StaggerItem>
          <KpiCard
            title="إيرادات الشهر"
            value={formatCurrency(summary.revenue_mtd)}
            icon={DollarSign}
            colorClass="text-green-600"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="مصاريف الشهر"
            value={formatCurrency(summary.expenses_mtd)}
            icon={ArrowDownCircle}
            colorClass="text-red-600"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="صافي الربح"
            value={formatCurrency(summary.profit_mtd)}
            icon={TrendingUp}
            colorClass={summary.profit_mtd >= 0 ? 'text-green-600' : 'text-red-600'}
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="مستحقات"
            value={formatCurrency(summary.outstanding)}
            icon={Receipt}
            colorClass="text-orange-600"
          />
        </StaggerItem>
        <StaggerItem>
          <KpiCard
            title="متأخرة"
            value={formatCurrency(summary.overdue)}
            icon={AlertTriangle}
            colorClass="text-red-600"
          />
        </StaggerItem>
      </StaggerContainer>

      {/* ═══ Charts Row ═══ */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue vs Expenses Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              الإيرادات مقابل المصاريف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueExpenseChart data={monthly_chart} />
          </CardContent>
        </Card>

        {/* Expense Categories Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5" />
              توزيع المصاريف
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseCategoryPieChart data={expense_pie} />
          </CardContent>
        </Card>
      </div>

      {/* ═══ Quick Stats + Upcoming Renewals ═══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Yearly Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              إحصائيات سنوية
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 divide-y">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">إيرادات سنوية</span>
              <span className="font-bold font-mono text-sm text-green-600">
                {formatCurrency(summary.revenue_ytd)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">مصاريف سنوية</span>
              <span className="font-bold font-mono text-sm text-red-600">
                {formatCurrency(summary.expenses_ytd)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">صافي سنوي</span>
              <span
                className={`font-bold font-mono text-sm ${
                  summary.profit_ytd >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatCurrency(summary.profit_ytd)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">اشتراكات شهرية</span>
              <span className="font-bold font-mono text-sm">
                {formatCurrency(summary.monthly_subs_cost)}
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">عقود نشطة</span>
              <span className="font-bold font-mono text-sm">{summary.active_contracts}</span>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Renewals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              تجديدات قادمة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming_renewals && upcoming_renewals.length > 0 ? (
              <div className="space-y-3">
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
                        <Badge variant={getRenewalBadgeVariant(days)}>
                          {days <= 0
                            ? 'اليوم'
                            : days === 1
                              ? 'غداً'
                              : `${days} يوم`}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                لا توجد تجديدات قريبة
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Quick Links ═══ */}
      <StaggerContainer className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StaggerItem>
          <QuickLinkCard
            href="/dashboard/finance/expenses"
            label="المصاريف"
            icon={ArrowDownCircle}
          />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard
            href="/dashboard/finance/subscriptions"
            label="الاشتراكات"
            icon={RefreshCw}
          />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard
            href="/dashboard/finance/cards"
            label="البطاقات"
            icon={CreditCard}
          />
        </StaggerItem>
        <StaggerItem>
          <QuickLinkCard
            href="/dashboard/finance/contracts"
            label="العقود"
            icon={FileSignature}
          />
        </StaggerItem>
      </StaggerContainer>
    </div>
  );
}
