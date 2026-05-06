'use client';

/**
 * Reusable stage badge.
 * Colors come from `pyra_sales_pipeline_stages.color` (seeded by migration 007),
 * with a Tailwind class map below. Unknown colors fall through to gray.
 *
 * The seed values from migration 007 are: sky, indigo, amber, orange,
 * emerald, gold, stone — listed below as keys.
 */

import { cn } from '@/lib/utils/cn';

const COLOR_CLASSES: Record<string, string> = {
  sky:     'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40',
  indigo:  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40',
  amber:   'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40',
  orange:  'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/40',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40',
  gold:    'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/40',
  stone:   'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/40',
  // Legacy stage_* color names (just in case anything is still tagged with them)
  blue:    'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40',
  purple:  'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/40',
  yellow:  'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/40',
  green:   'bg-green-500/10 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/40',
  red:     'bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40',
};

export interface LeadStagePillProps {
  label: string;
  color?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export function LeadStagePill({ label, color, size = 'sm', className }: LeadStagePillProps) {
  const tone = COLOR_CLASSES[color ?? ''] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        tone,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', tone.split(' ').find((c) => c.startsWith('text-')) ?? 'bg-current')}
        style={{ backgroundColor: 'currentColor' }}
      />
      {label}
    </span>
  );
}
