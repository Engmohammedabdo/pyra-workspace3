'use client';

import { cn } from '@/lib/utils/cn';
import { Crown, Flame, ChevronUp, Minus, Snowflake } from 'lucide-react';

const TONE: Record<string, { wrap: string; label: string }> = {
  vip:    { wrap: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/40', label: 'VIP' },
  urgent: { wrap: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40',                label: 'عاجل' },
  high:   { wrap: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/40', label: 'عالية' },
  medium: { wrap: 'bg-muted text-muted-foreground border-border',                                                        label: 'عادية' },
  low:    { wrap: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40',                  label: 'منخفضة' },
};

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  vip: Crown,
  urgent: Flame,
  high: ChevronUp,
  medium: Minus,
  low: Snowflake,
};

export interface LeadPriorityBadgeProps {
  priority: string | null | undefined;
  /** Hide the textual label and show only the icon (useful inside small cards) */
  iconOnly?: boolean;
  className?: string;
}

export function LeadPriorityBadge({ priority, iconOnly, className }: LeadPriorityBadgeProps) {
  const key = (priority ?? 'medium').toLowerCase();
  if (key === 'medium' && iconOnly) return null; // medium is the default — don't visually clutter
  const tone = TONE[key] ?? TONE.medium;
  const Icon = ICON[key] ?? Minus;

  if (iconOnly) {
    return (
      <span
        className={cn('inline-flex size-6 items-center justify-center rounded-full border', tone.wrap, className)}
        title={tone.label}
      >
        <Icon className="size-3.5" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        tone.wrap,
        className,
      )}
    >
      <Icon className="size-3" />
      {tone.label}
    </span>
  );
}
