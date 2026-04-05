'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface CsatBadgeProps {
  rating: number | null | undefined;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const RATING_COLORS: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-yellow-500',
  4: 'text-lime-500',
  5: 'text-emerald-500',
};

const RATING_BG: Record<number, string> = {
  1: 'bg-red-50 dark:bg-red-950/20 border-red-200/50 dark:border-red-800/30',
  2: 'bg-orange-50 dark:bg-orange-950/20 border-orange-200/50 dark:border-orange-800/30',
  3: 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200/50 dark:border-yellow-800/30',
  4: 'bg-lime-50 dark:bg-lime-950/20 border-lime-200/50 dark:border-lime-800/30',
  5: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/30',
};

export const CSAT_RATING_LABELS: Record<number, string> = {
  1: 'سيء جداً',
  2: 'سيء',
  3: 'متوسط',
  4: 'جيد',
  5: 'ممتاز',
};

/**
 * Small star badge showing CSAT rating (1-5).
 * Used in conversation-item and contact-panel.
 */
export function CsatBadge({ rating, size = 'sm', showLabel = false, className }: CsatBadgeProps) {
  if (!rating || rating < 1 || rating > 5) return null;

  const starSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5',
        RATING_BG[rating],
        className
      )}
      title={`CSAT: ${rating}/5 - ${CSAT_RATING_LABELS[rating]}`}
    >
      <Star className={cn(starSize, RATING_COLORS[rating], 'fill-current')} />
      <span className={cn(textSize, 'font-semibold tabular-nums', RATING_COLORS[rating])}>
        {rating}
      </span>
      {showLabel && (
        <span className={cn(textSize, 'text-muted-foreground/70 ms-0.5')}>
          {CSAT_RATING_LABELS[rating]}
        </span>
      )}
    </span>
  );
}

/**
 * Row of stars for displaying a rating (read-only).
 */
export function CsatStars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const starSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            starSize,
            i <= rating
              ? 'text-amber-400 fill-amber-400'
              : 'text-gray-200 dark:text-gray-700'
          )}
        />
      ))}
    </span>
  );
}
