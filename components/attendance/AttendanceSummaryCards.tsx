'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
} from 'lucide-react';
import { formatHours } from '@/lib/utils/format';
import type { AttendanceSummary } from '@/hooks/useAttendance';

interface AttendanceSummaryCardsProps {
  summary: AttendanceSummary | null;
  loading: boolean;
}

export default function AttendanceSummaryCards({
  summary,
  loading,
}: AttendanceSummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i} className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            أيام الحضور
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.present_days}</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            أيام التأخر
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.late_days}</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <XCircle className="h-4 w-4 text-red-500" />
            أيام الغياب
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.absent_days}</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <TrendingUp className="h-4 w-4 text-orange-500" />
            إجمالي الساعات
          </div>
          <p className="text-2xl font-bold text-foreground">{formatHours(summary.total_hours)}</p>
          {summary.avg_hours_per_day > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">
              المعدل: {formatHours(summary.avg_hours_per_day)} / يوم
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
