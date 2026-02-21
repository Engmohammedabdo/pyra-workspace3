'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

interface Alert {
  type: 'warning' | 'danger' | 'info';
  message: string;
  link: string;
}

const ALERT_STYLES: Record<string, { bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  danger: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    icon: AlertCircle,
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-950/30',
    text: 'text-yellow-700 dark:text-yellow-400',
    border: 'border-yellow-200 dark:border-yellow-800',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200 dark:border-blue-800',
    icon: Info,
  },
};

export function SmartAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis/alerts');
      const json = await res.json();
      if (json.data) setAlerts(json.data);
    } catch (err) {
      console.error('SmartAlerts fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  if (loading || alerts.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
      {alerts.map((alert, idx) => {
        const style = ALERT_STYLES[alert.type];
        const Icon = style.icon;

        return (
          <Link
            key={idx}
            href={alert.link}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium whitespace-nowrap',
              'transition-all duration-200 hover:shadow-sm shrink-0',
              style.bg,
              style.text,
              style.border,
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{alert.message}</span>
          </Link>
        );
      })}
    </div>
  );
}
