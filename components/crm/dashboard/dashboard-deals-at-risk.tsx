'use client';

/**
 * Deals-at-risk list — leads idle ≥ 7 days, sorted by `days_idle` desc.
 *
 * Per CRM Phase 8 spec (Cluster 3) and PRD §05 line 346:
 *   "Deals-at-risk list with WhatsApp reminder action"
 *
 * Each row: lead name + days idle + stage label + WhatsApp button. The
 * WhatsApp button uses the locked Phase 8 template from Q4 — see the
 * `crm.dashboard.dealsAtRisk.waTemplate` catalog key for the exact wording
 * (outbound customer message, i18n-exempt per Phase 8/9 scope discipline —
 * see the `useReminderTextBuilder` doc comment below).
 * `{service}` falls back to the `waFallbackService` key when the lead has no
 * `deal_type`.
 *
 * Cap visible rows at 5 with a "view all" link to a filtered Pipeline
 * view. The whole point is "the few deals you should poke today" — a
 * full unbounded list defeats the purpose.
 */

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDealsAtRisk } from '@/hooks/useCRMDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { AlertTriangle, MessageCircle, ArrowLeft } from 'lucide-react';
import { whatsAppHref } from '@/lib/utils/whatsapp';
import { PIPELINE_STAGE_IDS, type PipelineStageId } from '@/lib/constants/statuses';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { cn } from '@/lib/utils/cn';
import type { DealAtRisk } from '@/hooks/useCRMDashboard';

const VISIBLE_LIMIT = 5;

// Validity check without needing the full label map (the label itself now
// comes from useStatusLabels('pipelineStage') inside the component).
const VALID_STAGE_IDS: readonly string[] = Object.values(PIPELINE_STAGE_IDS);

/**
 * WhatsApp OUTBOUND message template — Phase 8 locked wording, customer-facing.
 * i18n-exempt: outbound customer message (Phase 8/9 scope). Rendered from the
 * crm.dashboard.dealsAtRisk.waTemplate / waFallbackService catalog keys so the
 * literal text still lives in the catalog (translatable per-locale), but the
 * decision to send a fixed customer-facing script is out of Phase 3's scope.
 */
function useReminderTextBuilder() {
  const t = useTranslations('crm.dashboard.dealsAtRisk');
  return (lead: { name: string; deal_type: string | null }): string => {
    const service = lead.deal_type?.trim() || t('waFallbackService'); // i18n-exempt: outbound customer message (Phase 8/9 scope)
    return t('waTemplate', { name: lead.name, service }); // i18n-exempt: outbound customer message (Phase 8/9 scope)
  };
}

function useDaysIdleLabel() {
  const t = useTranslations('crm.dashboard.idle');
  return (days: number | null): string => {
    if (days == null) return t('none');
    if (days <= 1) return t('days', { count: 1 });
    if (days <= 14) return t('days', { count: days });
    if (days <= 30) return t('weeks', { count: Math.floor(days / 7) });
    return t('months', { count: Math.floor(days / 30) });
  };
}

export function DashboardDealsAtRisk() {
  const t = useTranslations('crm.dashboard.dealsAtRisk');
  const { data, isLoading } = useDealsAtRisk(7);

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-2">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="size-9 rounded-full" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const deals = data?.deals_at_risk ?? [];
  const visible = deals.slice(0, VISIBLE_LIMIT);
  const hiddenCount = Math.max(deals.length - VISIBLE_LIMIT, 0);

  if (deals.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle className="size-4 text-muted-foreground" />
          {t('heading')}
        </h2>
        <EmptyState
          icon={AlertTriangle}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-500" />
          {t('heading')}
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            ({deals.length})
          </span>
        </h2>
      </header>
      <ul className="divide-y divide-border">
        {visible.map((lead) => (
          <DealRow key={lead.id} lead={lead} />
        ))}
      </ul>
      {hiddenCount > 0 && (
        <Link
          href="/dashboard/crm/pipeline?filter=at_risk"
          className="mt-3 flex items-center justify-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:underline"
        >
          {t('viewAllExtra', { hiddenCount })}
          <ArrowLeft className="size-3" aria-hidden />
        </Link>
      )}
    </Card>
  );
}

function DealRow({ lead }: { lead: DealAtRisk }) {
  const t = useTranslations('crm.dashboard.dealsAtRisk');
  const stagePipelineLabel = useStatusLabels('pipelineStage');
  const priorityLabel = useStatusLabels('leadPriority');
  const buildReminderText = useReminderTextBuilder();
  const daysIdleLabel = useDaysIdleLabel();
  const stageLabel =
    lead.stage_id && VALID_STAGE_IDS.includes(lead.stage_id)
      ? stagePipelineLabel(lead.stage_id as PipelineStageId)
      : null;
  const wa = whatsAppHref(lead.phone, buildReminderText(lead));

  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/dashboard/crm/leads/${lead.id}`}
          className="flex-1 min-w-0 group focus:outline-none focus:ring-2 focus:ring-orange-500/40 rounded-md"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
              {lead.name}
            </span>
            {lead.priority === 'high' && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 shrink-0">
                {priorityLabel('high')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-amber-600 dark:text-amber-400 tabular-nums">
              {t('sinceLabel', { duration: daysIdleLabel(lead.days_idle) })}
            </span>
            {stageLabel && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="truncate">{stageLabel}</span>
              </>
            )}
          </div>
        </Link>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'shrink-0 size-9 rounded-full flex items-center justify-center transition-colors',
              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              'hover:bg-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/40',
            )}
            aria-label={t('reminderAria', { name: lead.name })}
            title={t('reminderTitle')}
          >
            <MessageCircle className="size-4" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}
