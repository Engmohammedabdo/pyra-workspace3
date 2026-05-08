'use client';

/**
 * Gold-themed AI Insights banner.
 *
 * Per CRM Phase 8 spec (Cluster 1):
 *   - Base styling: gold-themed (PRD §04 line 271 "The gold-themed banner")
 *   - Severity indicator: small dot on the RTL-right side, color-coded:
 *       critical → orange-600
 *       high     → amber-500
 *       medium   → blue-500
 *       low      → emerald-500
 *   - Renders top-1 insight (server already sorts by SEVERITY_RANK)
 *   - Hidden entirely if no insights — don't render an empty container
 *   - Click anywhere on the banner → navigate to insight.link
 *
 * Severity rules + new `followups_today` rule are documented in CLAUDE.md
 * "CRM AI Insights — Severity Scheme". The 4-level severity union here
 * MUST match what the server emits (lockstep with
 * app/api/crm/dashboard/ai-insights/route.ts).
 */

import Link from 'next/link';
import { useCRMInsights, type CRMInsight } from '@/hooks/useCRMDashboard';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const SEVERITY_DOT: Record<CRMInsight['severity'], string> = {
  critical: 'bg-orange-600',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-emerald-500',
};

const SEVERITY_LABEL_AR: Record<CRMInsight['severity'], string> = {
  critical: 'حرج',
  high: 'عالي',
  medium: 'متوسط',
  low: 'منخفض',
};

export function DashboardAiInsight() {
  const { data, isLoading } = useCRMInsights();

  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-xl" />;
  }

  const top = data?.insights?.[0];
  // No insight → don't render an empty container. Per Phase 8 spec.
  if (!top) return null;

  const dotClass = SEVERITY_DOT[top.severity];
  const sevLabel = SEVERITY_LABEL_AR[top.severity];

  // Inner card (clickable if link present, plain div otherwise).
  const Inner = (
    <div
      className={cn(
        // Gold-themed base — PRD §04 directive. Amber + yellow gradient gives
        // the warm gold feel without needing a custom Tailwind config.
        'group relative flex items-center gap-3 rounded-xl border p-4 transition-shadow',
        'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30',
        'border-amber-200/70 dark:border-amber-800/40',
        top.link && 'hover:shadow-md cursor-pointer',
      )}
      role={top.link ? 'link' : undefined}
    >
      <div className="size-10 rounded-lg flex items-center justify-center bg-amber-500/15 text-amber-600 dark:text-amber-300 shrink-0">
        <Sparkles className="size-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-100 leading-snug">
          {top.message_ar}
        </div>
        {typeof top.value === 'number' && top.value > 0 && (
          <div className="text-xs text-amber-700/80 dark:text-amber-200/70 mt-0.5 tabular-nums">
            بقيمة تقديرية {Math.round(top.value).toLocaleString('en-US')} درهم
          </div>
        )}
      </div>
      {/* Severity indicator — small dot on the RTL-end (right) side with text label */}
      <div className="shrink-0 flex items-center gap-1.5" aria-label={`severity: ${top.severity}`}>
        <span className={cn('size-2 rounded-full', dotClass)} aria-hidden />
        <span className="text-[10px] font-medium text-amber-800/80 dark:text-amber-200/70">
          {sevLabel}
        </span>
      </div>
    </div>
  );

  // Wrap in <Link> only if insight provides one — keeps the banner static
  // for "info-only" insights without producing useless clickable affordance.
  if (top.link) {
    return (
      <Link
        href={top.link}
        className="block focus:outline-none focus:ring-2 focus:ring-amber-500/40 rounded-xl"
        aria-label={top.message_ar}
      >
        {Inner}
      </Link>
    );
  }
  return Inner;
}
