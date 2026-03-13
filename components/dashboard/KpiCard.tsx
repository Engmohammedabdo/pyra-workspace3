'use client';

import { cn } from '@/lib/utils/cn';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: { direction: 'up' | 'down' | 'neutral'; percent: number };
  accent?: string;
  gradient?: string;
  children?: React.ReactNode;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  accent,
  gradient,
  children,
}: KpiCardProps) {
  const gradientClass = gradient || 'from-orange-500 to-amber-600';

  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm',
        'shadow-sm hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/20',
        'transition-shadow duration-300 p-5',
        accent && 'border-s-[3px]',
      )}
      style={accent ? { borderInlineStartColor: accent } : undefined}
    >
      {/* Decorative gradient orb */}
      <div className={cn(
        'absolute -top-8 -end-8 w-24 h-24 rounded-full opacity-[0.07] blur-2xl',
        `bg-gradient-to-br ${gradientClass}`,
      )} />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground/80 mb-1.5 font-medium">{title}</p>
          <p className="text-[1.7rem] font-bold tracking-tight leading-none">{value}</p>

          {subtitle && (
            <p className="text-xs text-muted-foreground/60 mt-2">{subtitle}</p>
          )}

          {trend && (
            <div className="flex items-center gap-1.5 mt-3">
              <div className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                trend.direction === 'up' && 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
                trend.direction === 'down' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                trend.direction === 'neutral' && 'bg-gray-100 dark:bg-gray-800 text-gray-500',
              )}>
                {trend.direction === 'up' && (
                  <TrendingUp className="h-3 w-3" />
                )}
                {trend.direction === 'down' && (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trend.direction === 'neutral' && (
                  <Minus className="h-3 w-3" />
                )}
                {trend.percent > 0 ? '+' : ''}
                {trend.percent}%
              </div>
              <span className="text-[10px] text-muted-foreground/50">عن الشهر الماضي</span>
            </div>
          )}
        </div>

        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
          'bg-gradient-to-br shadow-lg',
          gradientClass,
        )}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>

      {children && <div className="relative mt-4">{children}</div>}
    </motion.div>
  );
}
