'use client';

import { cn } from '@/lib/utils/cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { direction: 'up' | 'down' | 'neutral'; percent: number };
  accent?: string;
  children?: React.ReactNode;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent,
  children,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-sm p-5',
        'transition-all duration-200 hover:shadow-md hover:border-primary/20',
        accent && 'border-l-4',
      )}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>

          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}

          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.direction === 'up' && (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {trend.direction === 'down' && (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              )}
              {trend.direction === 'neutral' && (
                <Minus className="h-3.5 w-3.5 text-gray-400" />
              )}
              <span
                className={cn(
                  'text-xs font-medium',
                  trend.direction === 'up' && 'text-emerald-500',
                  trend.direction === 'down' && 'text-red-500',
                  trend.direction === 'neutral' && 'text-gray-400',
                )}
              >
                {trend.percent > 0 ? '+' : ''}
                {trend.percent}%
              </span>
              <span className="text-xs text-muted-foreground mr-1">عن الشهر الماضي</span>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
