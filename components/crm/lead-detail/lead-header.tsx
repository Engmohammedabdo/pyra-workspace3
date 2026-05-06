'use client';

/**
 * Lead Detail header — avatar, name, stage pill, lead-type + priority badges,
 * and the quick-action row (WhatsApp / Call / Email / Note / Follow-up).
 *
 * Phase 5: WhatsApp/Call/Email are real deep links. Note + Follow-up are
 * visual-only (disabled with a tooltip pointing to Phase 6 mutations).
 *
 * Mobile: the same component with a full-bleed dark hero (max-md:bg-…)
 *   so the avatar, name, stage stand out at the top of the page —
 *   matches pyramedia-mobile.html screen 3.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LeadStagePill } from '@/components/crm/lead/lead-stage-pill';
import { LeadPriorityBadge } from '@/components/crm/lead/lead-priority-badge';
import {
  ArrowLeft, Phone, MessageCircle, Mail, NotebookPen, CalendarPlus, Building2,
} from 'lucide-react';
import {
  PIPELINE_STAGE_LABELS_AR,
  LEAD_TYPE_LABELS,
  type PipelineStageId,
  type LeadType,
} from '@/lib/constants/statuses';
import type { PyraSalesLead } from '@/types/database';
import type { PipelineStage } from '@/hooks/usePipelineStages';

interface LeadHeaderProps {
  lead: PyraSalesLead;
  /** Stage rows so we can pull the correct color for the pill. */
  stages?: PipelineStage[];
  /** Switch to the Activity tab and focus the note composer. */
  onAddNote?: () => void;
  /** Open the Schedule Follow-up modal. */
  onScheduleFollowUp?: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function whatsAppHref(phone: string | null | undefined, name: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  const greeting = name ? `أهلاً ${name}،` : 'أهلاً،';
  return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
}

export function LeadHeader({ lead, stages, onAddNote, onScheduleFollowUp }: LeadHeaderProps) {
  const stage = stages?.find((s) => s.id === lead.stage_id);
  const stageLabel = stage?.name_ar
    ?? (lead.stage_id ? PIPELINE_STAGE_LABELS_AR[lead.stage_id as PipelineStageId] : null);
  const wa = whatsAppHref(lead.phone, lead.name);

  return (
    <div className="space-y-3">
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link href="/dashboard/crm/pipeline">
          <ArrowLeft className="size-4 me-1" /> الـ Pipeline
        </Link>
      </Button>

      <div
        className={cn(
          // Card-like on desktop, full-bleed dark hero on mobile.
          'relative rounded-2xl border border-border bg-card overflow-hidden',
          'max-md:rounded-none max-md:border-x-0 max-md:-mx-4 max-md:bg-gradient-to-br',
          'max-md:from-zinc-900 max-md:to-zinc-800 max-md:text-white max-md:border-y-0',
        )}
      >
        <div className="p-5 max-md:p-6">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'shrink-0 size-14 rounded-2xl flex items-center justify-center text-lg font-bold',
                'bg-gradient-to-br from-orange-500 to-orange-600 text-white',
                'ring-2 ring-orange-500/20',
              )}
              aria-hidden
            >
              {initials(lead.name)}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold leading-7 truncate">{lead.name}</h1>
              {lead.company && (
                <p
                  className={cn(
                    'text-sm flex items-center gap-1.5 mt-1 truncate',
                    'text-muted-foreground max-md:text-zinc-300',
                  )}
                >
                  <Building2 className="size-3.5 shrink-0" />
                  <span className="truncate">{lead.company}</span>
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {stageLabel && <LeadStagePill label={stageLabel} color={stage?.color} />}
                {lead.lead_type && (
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/40 max-md:bg-orange-500/20 max-md:text-orange-200 max-md:border-orange-400/30">
                    {LEAD_TYPE_LABELS[lead.lead_type as LeadType] ?? lead.lead_type.toUpperCase()}
                  </Badge>
                )}
                <LeadPriorityBadge priority={lead.priority} />
                {(lead.win_probability ?? 0) > 0 && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 tabular-nums max-md:bg-emerald-500/20 max-md:text-emerald-200 max-md:border-emerald-400/30">
                    احتمال الفوز · {lead.win_probability}%
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions — wrap on mobile */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {wa && (
              <Button asChild variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4 me-1.5" /> WhatsApp
                </a>
              </Button>
            )}
            {lead.phone && (
              <Button asChild variant="outline" size="sm" className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20">
                <a href={`tel:${lead.phone}`}>
                  <Phone className="size-4 me-1.5" /> اتصال
                </a>
              </Button>
            )}
            {lead.email && (
              <Button asChild variant="outline" size="sm" className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20">
                <a href={`mailto:${lead.email}`}>
                  <Mail className="size-4 me-1.5" /> إيميل
                </a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onAddNote}
              disabled={!onAddNote}
              className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
            >
              <NotebookPen className="size-4 me-1.5" /> ملاحظة
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onScheduleFollowUp}
              disabled={!onScheduleFollowUp}
              className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
            >
              <CalendarPlus className="size-4 me-1.5" /> متابعة
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
