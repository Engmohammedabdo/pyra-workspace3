'use client';

import { Card, CardContent } from '@/components/ui/card';
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { StaggerContainer, StaggerItem } from '@/components/ui/stagger-list';

function getProfitMargin(revenue: number, expenses: number): string {
  if (revenue === 0) return '0%';
  return `${Math.round(((revenue - expenses) / revenue) * 100)}%`;
}

export function FinanceSummaryCards({ summary }: { summary: any }) {
  return (
    <StaggerContainer className="grid gap-4 grid-cols-1 md:grid-cols-3">
      <StaggerItem>
        <Card className="transition-all duration-200 hover:shadow-md hover:border-green-500/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">فلوس دخلت</span>
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ArrowUpCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <p className="text-3xl font-bold font-mono text-green-600 dark:text-green-400">{formatCurrency(summary.revenue_mtd)}</p>
            <p className="text-xs text-muted-foreground mt-2">من بداية السنة: {formatCurrency(summary.revenue_ytd)}</p>
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card className="transition-all duration-200 hover:shadow-md hover:border-red-500/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">فلوس طلعت</span>
              <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ArrowDownCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-3xl font-bold font-mono text-red-600 dark:text-red-400">{formatCurrency(summary.expenses_mtd)}</p>
            <p className="text-xs text-muted-foreground mt-2">من بداية السنة: {formatCurrency(summary.expenses_ytd)}</p>
          </CardContent>
        </Card>
      </StaggerItem>

      <StaggerItem>
        <Card className={`transition-all duration-200 hover:shadow-md ${summary.profit_mtd >= 0 ? 'hover:border-green-500/30' : 'hover:border-red-500/30'}`}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-muted-foreground">الصافي</span>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${summary.profit_mtd >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {summary.profit_mtd >= 0 ? <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" /> : <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />}
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className={`text-3xl font-bold font-mono ${summary.profit_mtd >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(summary.profit_mtd)}</p>
              {summary.revenue_mtd > 0 && <Badge variant={summary.profit_mtd >= 0 ? 'default' : 'destructive'} className="text-xs">هامش {getProfitMargin(summary.revenue_mtd, summary.expenses_mtd)}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-2">من بداية السنة: {formatCurrency(summary.profit_ytd)}</p>
          </CardContent>
        </Card>
      </StaggerItem>
    </StaggerContainer>
  );
}
