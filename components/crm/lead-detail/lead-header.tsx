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
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LeadStagePill } from '@/components/crm/lead/lead-stage-pill';
import { LeadPriorityBadge } from '@/components/crm/lead/lead-priority-badge';
import {
  ArrowLeft, Phone, MessageCircle, Mail, NotebookPen, CalendarPlus, Building2,
  Link2, UserCheck, FileSignature, UserCog, Archive, ArchiveRestore, Pencil,
} from 'lucide-react';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import {
  type PipelineStageId,
  type LeadType,
} from '@/lib/constants/statuses';
import { usePermission } from '@/hooks/usePermission';
import type { PyraSalesLead } from '@/types/database';
import type { PipelineStage } from '@/hooks/usePipelineStages';

interface LeadHeaderProps {
  lead: PyraSalesLead;
  /** Joined from GET /api/crm/leads/[id] when lead.client_id is set (Phase 11.5). */
  client_name?: string | null;
  /** Stage rows so we can pull the correct color for the pill. */
  stages?: PipelineStage[];
  /** Switch to the Activity tab and focus the note composer. */
  onAddNote?: () => void;
  /** Open the Schedule Follow-up modal. */
  onScheduleFollowUp?: () => void;
  /** Open the Link-Client modal (Phase 11.5). Admin actions row hidden when undefined. */
  onLinkClient?: () => void;
  /** Whether current user has leads.update permission. Required for the Link button visibility. */
  canLinkClient?: boolean;
  /** Open the Reassign-owner modal (Commit 1 / Option A). */
  onReassign?: () => void;
  /** Whether current user has leads.assign permission. Required for the Reassign button. */
  canReassign?: boolean;
  /** Archive / un-archive the lead (soft-archive, migration 030). */
  onArchive?: () => void;
  /** Whether current user has leads.delete permission. Gates the Archive button. */
  canArchive?: boolean;
  /** Open the admin-only Edit-Lead-Data dialog. */
  onEditCore?: () => void;
  /** Whether current user has leads.edit_core permission (admin-only). Gates the Edit button. */
  canEditCore?: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function whatsAppHref(
  phone: string | null | undefined,
  name: string | null | undefined,
  greetingNamed: (name: string) => string,
  greetingPlain: string,
): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  const greeting = name ? greetingNamed(name) : greetingPlain;
  return `https://wa.me/${digits}?text=${encodeURIComponent(greeting)}`;
}

export function LeadHeader({
  lead,
  client_name,
  stages,
  onAddNote,
  onScheduleFollowUp,
  onLinkClient,
  canLinkClient,
  onReassign,
  canReassign,
  onArchive,
  canArchive,
  onEditCore,
  canEditCore,
}: LeadHeaderProps) {
  const t = useTranslations('crm.lead.header');
  const stageLabelFor = useStatusLabels('pipelineStage');
  const leadTypeLabelFor = useStatusLabels('leadType');
  const isArchived = !!lead.archived_at;
  const stage = stages?.find((s) => s.id === lead.stage_id);
  const stageLabel = stage?.name_ar
    ?? (lead.stage_id ? stageLabelFor(lead.stage_id as PipelineStageId) : null);
  const wa = whatsAppHref(
    lead.phone,
    lead.name,
    (name) => t('whatsappGreetingNamed', { name }),
    t('whatsappGreetingPlain'),
  );
  // Permission gate for the "Create quote" button — closes the discoverability
  // gap surfaced by Sayed's real-world workflow (a lead at the Discovery Call
  // stage needed a quote; backend was complete but no in-app entry point
  // existed). sales_agent role has quotes.create per lib/auth/rbac.ts ROLE_EXTRAS.
  const canCreateQuote = usePermission('quotes.create');

  return (
    <div className="space-y-3">
      <Button asChild variant="ghost" size="sm" className="-ms-2">
        <Link href="/dashboard/crm/pipeline">
          <ArrowLeft className="size-4 me-1" /> {t('backToPipeline')}
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
                    {leadTypeLabelFor(lead.lead_type as LeadType) ?? lead.lead_type.toUpperCase()}
                  </Badge>
                )}
                <LeadPriorityBadge priority={lead.priority} />
                {isArchived && (
                  <Badge variant="outline" className="bg-stone-500/10 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700/50 max-md:bg-stone-500/20 max-md:text-stone-200 max-md:border-stone-400/30">
                    <Archive className="size-3 me-1" /> {t('archivedBadge')}
                  </Badge>
                )}
                {(lead.win_probability ?? 0) > 0 && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 tabular-nums max-md:bg-emerald-500/20 max-md:text-emerald-200 max-md:border-emerald-400/30">
                    {t('winProbabilityBadge', { percent: lead.win_probability })}
                  </Badge>
                )}
                {/* Phase 11.5 — linked-client badge. Clickable Link to the client page. */}
                {lead.client_id && client_name && (
                  <Link
                    href={`/dashboard/clients/${lead.client_id}`}
                    className="inline-flex"
                    aria-label={t('linkedClientAria', { name: client_name })}
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/40',
                        'max-md:bg-sky-500/20 max-md:text-sky-200 max-md:border-sky-400/30',
                        'hover:bg-sky-500/20 dark:hover:bg-sky-500/20 transition-colors',
                      )}
                    >
                      <Link2 className="size-3 me-1" />
                      {t('linkedClientBadge', { name: client_name })}
                    </Badge>
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Quick actions — wrap on mobile */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {wa && (
              <Button asChild variant="default" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="size-4 me-1.5" /> {t('whatsapp')}
                </a>
              </Button>
            )}
            {lead.phone && (
              <Button asChild variant="outline" size="sm" className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20">
                <a href={`tel:${lead.phone}`}>
                  <Phone className="size-4 me-1.5" /> {t('call')}
                </a>
              </Button>
            )}
            {lead.email && (
              <Button asChild variant="outline" size="sm" className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20">
                <a href={`mailto:${lead.email}`}>
                  <Mail className="size-4 me-1.5" /> {t('email')}
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
              <NotebookPen className="size-4 me-1.5" /> {t('note')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onScheduleFollowUp}
              disabled={!onScheduleFollowUp}
              className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
            >
              <CalendarPlus className="size-4 me-1.5" /> {t('followUp')}
            </Button>
            {/* "Create quote" — quote CTA. Links to the existing
                /dashboard/quotes/new?lead_id= flow (Phase 9 nullable
                client_id + lead_id FK; auto-prefills from lead via the
                QuoteBuilder useEffect). Gated by quotes.create permission
                (sales_agent has it; employee does not). Logical placement:
                after follow-up button (workflow: call → schedule next call
                → create quote → win deal). */}
            {canCreateQuote && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
              >
                <Link href={`/dashboard/quotes/new?lead_id=${lead.id}`}>
                  <FileSignature className="size-4 me-1.5" /> {t('createQuote')}
                </Link>
              </Button>
            )}
          </div>

          {/* Admin actions row. Shows when EITHER:
              - Reassign is available (Commit 1: leads.assign + onReassign), OR
              - Link-Client is available (Phase 11.5: lead not yet linked +
                leads.update + onLinkClient).
              Each button is independently gated so the row renders whenever at
              least one admin action applies. */}
          {((canEditCore && onEditCore) ||
            (canReassign && onReassign) ||
            (!lead.client_id && canLinkClient && onLinkClient) ||
            (canArchive && onArchive)) && (
            <div className="mt-4 pt-4 border-t border-border/50 max-md:border-white/10 flex flex-wrap gap-2">
              {canEditCore && onEditCore && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEditCore}
                  className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
                >
                  <Pencil className="size-4 me-1.5" /> {t('editData')}
                </Button>
              )}
              {canReassign && onReassign && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReassign}
                  className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
                >
                  <UserCog className="size-4 me-1.5" /> {t('reassign')}
                </Button>
              )}
              {!lead.client_id && canLinkClient && onLinkClient && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLinkClient}
                  className="max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20"
                >
                  <UserCheck className="size-4 me-1.5" /> {t('linkClient')}
                </Button>
              )}
              {canArchive && onArchive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onArchive}
                  className={cn(
                    'max-md:bg-white/10 max-md:text-white max-md:border-white/20 max-md:hover:bg-white/20',
                    !isArchived && 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border-red-200 dark:border-red-900/50 max-md:text-red-300',
                  )}
                >
                  {isArchived ? (
                    <><ArchiveRestore className="size-4 me-1.5" /> {t('unarchive')}</>
                  ) : (
                    <><Archive className="size-4 me-1.5" /> {t('archive')}</>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
