'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Clock, AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useSlaStats } from '@/hooks/useWhatsApp';

interface SlaStatsCardProps {
  days?: number;
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  const remaining = mins % 60;
  if (remaining === 0) return `${hours} ساعة`;
  return `${hours}س ${remaining}د`;
}

export function SlaStatsCard({ days = 30 }: SlaStatsCardProps) {
  const { data: stats, isLoading } = useSlaStats({ days });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-orange-500" />
            <Skeleton className="h-4 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-orange-500" />
            اتفاقيات مستوى الخدمة (SLA)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            لا توجد بيانات SLA بعد
          </p>
        </CardContent>
      </Card>
    );
  }

  const complianceColor = stats.compliance_rate >= 90
    ? 'text-green-600 dark:text-green-400'
    : stats.compliance_rate >= 70
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-red-600 dark:text-red-400';

  const complianceBg = stats.compliance_rate >= 90
    ? 'from-green-500'
    : stats.compliance_rate >= 70
      ? 'from-yellow-500'
      : 'from-red-500';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4 text-orange-500" />
          اتفاقيات مستوى الخدمة (SLA)
          <span className="text-xs text-muted-foreground font-normal ms-auto">
            آخر {days} يوم
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Compliance Rate Ring */}
        <div className="flex items-center justify-center gap-6">
          <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                className="text-muted/20"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                className={cn('stroke-current', complianceBg.replace('from-', 'text-'))}
                strokeWidth="3"
                strokeDasharray={`${stats.compliance_rate}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn('text-xl font-bold', complianceColor)}>
                {stats.compliance_rate}%
              </span>
              <span className="text-[9px] text-muted-foreground">التزام</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <span className="text-xs text-muted-foreground">ضمن SLA:</span>
              <span className="text-xs font-semibold">{stats.within_sla}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              <span className="text-xs text-muted-foreground">تجاوز:</span>
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">{stats.breached}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">إجمالي:</span>
              <span className="text-xs font-semibold">{stats.total}</span>
            </div>
          </div>
        </div>

        {/* Averages */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/30 dark:border-blue-800/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط الرد الأول</p>
            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {formatMinutes(stats.avg_first_response_mins)}
            </p>
          </div>
          <div className="rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/30 dark:border-purple-800/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">متوسط وقت الحل</p>
            <p className="text-sm font-bold text-purple-600 dark:text-purple-400">
              {formatMinutes(stats.avg_resolution_mins)}
            </p>
          </div>
        </div>

        {/* By Agent */}
        {stats.by_agent.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>حسب الوكيل</span>
            </div>
            <div className="space-y-1.5">
              {stats.by_agent.map(agent => (
                <div
                  key={agent.agent}
                  className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-muted/30"
                >
                  <span className="font-medium truncate max-w-[120px]">{agent.agent}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      'font-semibold',
                      agent.compliance_rate >= 90
                        ? 'text-green-600 dark:text-green-400'
                        : agent.compliance_rate >= 70
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                    )}>
                      {agent.compliance_rate}%
                    </span>
                    {agent.breached > 0 && (
                      <span className="text-red-500 text-[10px]">
                        ({agent.breached} تجاوز)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
