'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ArrowLeft, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AlertItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

interface Alert {
  type: 'warning' | 'danger' | 'info';
  message: string;
  link: string;
  items?: AlertItem[];
}

const ALERT_STYLES: Record<string, {
  bg: string;
  bgHover: string;
  text: string;
  border: string;
  itemBg: string;
  itemHover: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  dot: string;
}> = {
  danger: {
    bg: 'bg-red-50/80 dark:bg-red-950/20',
    bgHover: 'hover:bg-red-100/70 dark:hover:bg-red-950/40',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200/60 dark:border-red-800/40',
    itemBg: 'bg-red-50/30 dark:bg-red-950/10',
    itemHover: 'hover:bg-red-100/50 dark:hover:bg-red-950/30',
    icon: AlertCircle,
    gradient: 'from-red-500 to-rose-600',
    dot: 'bg-red-500',
  },
  warning: {
    bg: 'bg-yellow-50/80 dark:bg-yellow-950/20',
    bgHover: 'hover:bg-yellow-100/70 dark:hover:bg-yellow-950/40',
    text: 'text-yellow-700 dark:text-yellow-400',
    border: 'border-yellow-200/60 dark:border-yellow-800/40',
    itemBg: 'bg-yellow-50/30 dark:bg-yellow-950/10',
    itemHover: 'hover:bg-yellow-100/50 dark:hover:bg-yellow-950/30',
    icon: AlertTriangle,
    gradient: 'from-yellow-500 to-amber-600',
    dot: 'bg-yellow-500',
  },
  info: {
    bg: 'bg-blue-50/80 dark:bg-blue-950/20',
    bgHover: 'hover:bg-blue-100/70 dark:hover:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-400',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    itemBg: 'bg-blue-50/30 dark:bg-blue-950/10',
    itemHover: 'hover:bg-blue-100/50 dark:hover:bg-blue-950/30',
    icon: Info,
    gradient: 'from-blue-500 to-indigo-600',
    dot: 'bg-blue-500',
  },
};

export function SmartAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis/alerts');
      const json = await res.json();
      if (json.data) setAlerts(json.data);
    } catch {
      // Silently fail - alerts are non-critical
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

  const toggleExpand = (idx: number) => {
    setExpandedIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((alert, idx) => {
        const style = ALERT_STYLES[alert.type];
        const Icon = style.icon;
        const hasItems = alert.items && alert.items.length > 0;
        const isExpanded = expandedIndex === idx;

        return (
          <div
            key={idx}
            className={cn(
              'rounded-2xl border overflow-hidden transition-all duration-200 backdrop-blur-sm',
              style.border,
              isExpanded ? 'shadow-md' : 'shadow-sm',
            )}
          >
            {/* Header — clickable to expand or navigate */}
            {hasItems ? (
              <button
                onClick={() => toggleExpand(idx)}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 text-sm font-medium text-start',
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
                {alert.items && (
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full',
                    'bg-white/60 dark:bg-white/10',
                  )}>
                    {alert.items.length}
                  </span>
                )}
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                </motion.div>
              </button>
            ) : (
              <Link
                href={alert.link}
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
            )}

            {/* Expandable item list */}
            <AnimatePresence initial={false}>
              {isExpanded && hasItems && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className={cn('border-t', style.border)}>
                    {alert.items!.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2.5 text-sm group',
                          'border-b last:border-b-0 transition-all duration-150',
                          style.border,
                          style.itemBg,
                          style.itemHover,
                        )}
                      >
                        <div className={cn(
                          'w-1.5 h-1.5 rounded-full shrink-0',
                          style.dot,
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-foreground truncate">
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {item.subtitle}
                            </div>
                          )}
                        </div>
                        <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    ))}

                    {/* "Show All" footer link */}
                    <Link
                      href={alert.link}
                      className={cn(
                        'flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium',
                        'transition-colors duration-150',
                        style.text,
                        style.itemBg,
                        style.itemHover,
                      )}
                    >
                      <span>عرض الكل</span>
                      <ArrowLeft className="h-3 w-3" />
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
