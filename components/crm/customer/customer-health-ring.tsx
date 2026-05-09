'use client';

/**
 * SVG ring for the customer health score (0-100).
 *
 * Pure visual component — no data fetching. Score + color are passed as
 * props from the dossier hook (see hooks/useCustomerDossier.ts and
 * CLAUDE.md "## CRM Health Score" for the formula).
 *
 * Color mapping (Phase 9 Q9-3):
 *   emerald (75-100) | amber (50-74) | orange (25-49) | red (0-24)
 *
 * The ring is animated via CSS transition on `stroke-dasharray` so the
 * arc smoothly fills as data updates (e.g., admin records a payment in
 * /dashboard/finance and the dossier refetches via
 * `refetchOnWindowFocus`).
 */

import { cn } from '@/lib/utils/cn';
import type { HealthColor } from '@/hooks/useCustomerDossier';

interface Props {
  score: number;
  color: HealthColor;
  /** Tailwind size class (default `size-20` ≈ 80px). */
  className?: string;
}

const STROKE_BY_COLOR: Record<HealthColor, string> = {
  emerald: 'stroke-emerald-500',
  amber:   'stroke-amber-500',
  orange:  'stroke-orange-500',
  red:     'stroke-red-500',
};

// 2π × 42 ≈ 263.89 — the full-circle arc length for r=42
const FULL_CIRCUMFERENCE = 264;

export function CustomerHealthRing({ score, color, className }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const dashArray = (clamped / 100) * FULL_CIRCUMFERENCE;
  const strokeClass = STROKE_BY_COLOR[color];

  return (
    <svg
      viewBox="0 0 100 100"
      className={cn('size-20', className)}
      role="img"
      aria-label={`Health score ${clamped} out of 100`}
    >
      {/* Background track */}
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        strokeWidth="8"
        className="stroke-muted"
      />
      {/* Foreground arc — color from health_score.color */}
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        className={cn('transition-[stroke-dasharray] duration-700 ease-out', strokeClass)}
        strokeDasharray={`${dashArray} ${FULL_CIRCUMFERENCE}`}
        transform="rotate(-90 50 50)"
      />
      {/* Center label */}
      <text
        x="50"
        y="58"
        textAnchor="middle"
        className="fill-foreground font-bold"
        style={{ fontSize: '24px' }}
      >
        {clamped}
      </text>
    </svg>
  );
}
