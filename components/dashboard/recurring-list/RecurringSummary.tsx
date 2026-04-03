'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface SummaryProps {
  total: number;
  activeCount: number;
  dueCount: number;
}

export function RecurringSummary({ total, activeCount, dueCount }: SummaryProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">إجمالي القوالب</p>
            <p className="text-2xl font-bold mt-1">{total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">نشطة</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">مستحقة التوليد</p>
            <p className="text-2xl font-bold mt-1 text-orange-600">{dueCount}</p>
          </CardContent>
        </Card>
      </div>

      {dueCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              {dueCount} فاتورة متكررة مستحقة التوليد
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              اضغط على &quot;توليد الفواتير المستحقة&quot; لإنشاء الفواتير تلقائيا
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
