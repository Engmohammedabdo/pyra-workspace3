'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { AlertCircle, AlertTriangle, Info, Bell, ExternalLink } from 'lucide-react';
import type { HROverview } from '@/hooks/useHROverview';

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

interface HrAlertsProps {
  alerts: HROverview['alerts'];
}

const SEVERITY_STYLES: Record<AlertSeverity, {
  bg: string;
  bgHover: string;
  text: string;
  border: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
}> = {
  critical: {
    bg: 'bg-red-50/80 dark:bg-red-950/20',
    bgHover: 'hover:bg-red-100/70 dark:hover:bg-red-950/40',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200/60 dark:border-red-800/40',
    icon: AlertCircle,
    gradient: 'from-red-500 to-rose-600',
  },
  high: {
    bg: 'bg-orange-50/80 dark:bg-orange-950/20',
    bgHover: 'hover:bg-orange-100/70 dark:hover:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-200/60 dark:border-orange-800/40',
    icon: AlertTriangle,
    gradient: 'from-orange-500 to-amber-600',
  },
  medium: {
    bg: 'bg-yellow-50/80 dark:bg-yellow-950/20',
    bgHover: 'hover:bg-yellow-100/70 dark:hover:bg-yellow-950/40',
    text: 'text-yellow-700 dark:text-yellow-400',
    border: 'border-yellow-200/60 dark:border-yellow-800/40',
    icon: AlertTriangle,
    gradient: 'from-yellow-500 to-amber-600',
  },
  low: {
    bg: 'bg-blue-50/80 dark:bg-blue-950/20',
    bgHover: 'hover:bg-blue-100/70 dark:hover:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    icon: Info,
    gradient: 'from-blue-500 to-indigo-600',
  },
};

export function HrAlerts({ alerts }: HrAlertsProps) {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((alert) => {
        const style = SEVERITY_STYLES[alert.severity];
        const Icon = style.icon;

        return (
          <div
            key={alert.id}
            className={cn(
              'rounded-2xl border overflow-hidden transition-all duration-200 backdrop-blur-sm shadow-sm',
              style.border,
            )}
          >
            <Link
              href={alert.href}
              className={cn(
                'flex items-center gap-3 w-full px-4 py-3 text-sm font-medium',
                'transition-all duration-200',
                style.bg,
                style.bgHover,
                style.text,
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                'bg-gradient-to-br shadow-sm',
                style.gradient,
              )}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <span className="flex-1">{alert.message}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
