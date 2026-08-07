'use client';

// Deal banner (CR-T5) — replaces most of the old WhatsApp-clone chat header.
//   Row 1: identity (avatar, name, line badge, company/phone subtitle) +
//          KPIs (last contact, source) + the dark drawer-toggle button.
//   Row 2: read-only pipeline-stage steps (lib: stage-steps.tsx), or a muted
//          "مغلق - خسر" chip for a lost deal.
//   Row 3: the five sales actions, always visible, + an open-follow-up chip.
// No linked lead → degrades to row 1 + a single primary "إنشاء عميل" action
// (opens the existing create-lead dialog).
//
// i18n-exempt: components/sales/chat/** is Phase 6e (not yet migrated) —
// Arabic literals match the rest of this surface.

import type { ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt, Clock, StickyNote, UserPlus, Users } from 'lucide-react';
import { fetchAPI, buildQueryString } from '@/hooks/api-helpers';
import { useLead } from '@/hooks/useLeads';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { formatRelativeDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import type { Conversation } from '@/hooks/useWhatsApp';
import { isNonCompanyLine, lineLabel } from './line-label';
import { StageSteps } from './stage-steps';

const SOURCE_LABELS_AR: Record<string, string> = {
  whatsapp: 'WhatsApp',
  website: 'الموقع',
  referral: 'إحالة',
  manual: 'يدوي',
  ad: 'إعلان',
  social: 'سوشيال',
};

interface OpenFollowUp {
  id: string;
  due_at: string;
}

export type DealDialog = 'quote' | 'invoice' | 'note' | 'followup' | 'lead';

interface DealBannerProps {
  conversation: Conversation;
  isAdmin?: boolean;
  isContactTyping?: boolean;
  onOpenDialog: (dialog: DealDialog) => void;
  onAssign: () => void;
  onToggleDrawer: () => void;
}

export function DealBanner({
  conversation,
  isAdmin,
  isContactTyping,
  onOpenDialog,
  onAssign,
  onToggleDrawer,
}: DealBannerProps) {
  const leadId = conversation.lead_id || undefined;
  const hasLead = !!leadId;

  const { data: leadDetail } = useLead(leadId);
  const lead = leadDetail?.lead;

  const { data: stages = [] } = usePipelineStages();

  // Open follow-up chip — soonest due, scoped to this lead. Skipped
  // entirely (never fetched) when there's no linked lead.
  const { data: followUpData } = useQuery<{ follow_ups: OpenFollowUp[] }>({
    queryKey: ['crm-lead-open-followup', leadId],
    queryFn: () =>
      fetchAPI(`/api/crm/follow-ups${buildQueryString({ lead_id: leadId, status: 'pending', limit: '1' })}`),
    enabled: hasLead,
    staleTime: 30_000,
  });
  const openFollowUp = followUpData?.follow_ups?.[0] ?? null;

  const phone = conversation.phone || conversation.contact_phone || '';
  const displayPhone = phone && phone.length > 5 ? `+${phone}` : phone;
  const displayName = conversation.is_group
    ? conversation.group_subject || conversation.contact_name || displayPhone
    : conversation.contact_name || displayPhone || 'غير معروف';
  const subtitle = isContactTyping
    ? 'يكتب...'
    : conversation.is_group
      ? `${conversation.participant_count ?? 0} عضو`
      : lead?.company || (conversation.contact_name ? displayPhone : null);

  const isWon = lead?.stage_id === PIPELINE_STAGE_IDS.CLOSED_WON;
  const isLost = lead?.stage_id === PIPELINE_STAGE_IDS.CLOSED_LOST;

  return (
    <div className="border-b border-border bg-card">
      {/* Row 1 — identity + KPIs + drawer toggle */}
      <div className="mx-auto flex w-full max-w-[900px] items-center gap-3 px-4 py-2.5">
        <div className="h-10 w-10 shrink-0 rounded-full border border-border overflow-hidden">
          {conversation.is_group ? (
            conversation.group_picture_url ? (
              <img src={conversation.group_picture_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
                <Users className="h-5 w-5" />
              </div>
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-sm font-medium text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[15px] font-semibold text-foreground">{displayName}</p>
            {isNonCompanyLine(conversation.instance_name) && (
              <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                {lineLabel(conversation.instance_name)}
              </span>
            )}
          </div>
          {subtitle && (
            <p className={cn('truncate text-[12px]', isContactTyping ? 'text-primary' : 'text-muted-foreground')}>
              {subtitle}
            </p>
          )}
        </div>

        {lead && (
          <div className="hidden shrink-0 items-center gap-3 sm:flex">
            <Kpi label="آخر تواصل" value={lead.last_contact_at ? formatRelativeDate(lead.last_contact_at) : '—'} />
            <Kpi label="المصدر" value={SOURCE_LABELS_AR[lead.source] || lead.source} />
          </div>
        )}

        {/* No-lead conversations render this button below, grouped with
            "إنشاء عميل" instead of alone up here — see the no-lead branch. */}
        {hasLead && (
          <button
            type="button"
            onClick={onToggleDrawer}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background transition-colors hover:bg-foreground/90"
          >
            👤 كارت العميل
          </button>
        )}
      </div>

      {hasLead ? (
        <>
          {/* Row 2 — stage steps, or a muted "closed-lost" chip */}
          <div className="mx-auto w-full max-w-[900px] border-t border-border/60 px-4 py-1.5">
            {!lead ? (
              <Skeleton className="h-5 w-40 rounded-full" />
            ) : isLost ? (
              <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                مغلق - خسر
              </span>
            ) : (
              <StageSteps stages={stages} currentStageId={lead.stage_id} isWon={isWon} />
            )}
          </div>

          {/* Row 3 — sales actions, always visible + open-follow-up chip */}
          <div className="mx-auto flex w-full max-w-[900px] items-center gap-1.5 overflow-x-auto border-t border-border/60 px-4 py-1.5 scrollbar-none">
            <ActionButton
              icon={Plus}
              label="عرض سعر"
              onClick={() => onOpenDialog('quote')}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            />
            <ActionButton
              icon={Receipt}
              label="فاتورة"
              onClick={() => onOpenDialog('invoice')}
              className="bg-purple-500/10 text-purple-700 hover:bg-purple-500/20 dark:text-purple-400"
            />
            <ActionButton
              icon={Clock}
              label="متابعة"
              onClick={() => onOpenDialog('followup')}
              className="bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-400"
            />
            <ActionButton
              icon={StickyNote}
              label="ملاحظة"
              onClick={() => onOpenDialog('note')}
              className="bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 dark:text-yellow-400"
            />
            {isAdmin && (
              <ActionButton
                icon={UserPlus}
                label="إسناد"
                onClick={onAssign}
                className="border border-border bg-card text-muted-foreground hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-300"
              />
            )}
            {openFollowUp && (
              <span className="ms-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                ⏰ متابعة: {formatRelativeDate(openFollowUp.due_at)}
              </span>
            )}
          </div>
        </>
      ) : (
        // No linked lead — "كارت العميل" joins "إنشاء عميل" in one
        // end-aligned action group instead of floating alone up in row 1
        // (there are no KPIs here to visually anchor it to).
        <div className="mx-auto flex w-full max-w-[900px] items-center justify-end gap-2 border-t border-border/60 px-4 py-2">
          <button
            type="button"
            onClick={() => onOpenDialog('lead')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            إنشاء عميل
          </button>
          <button
            type="button"
            onClick={onToggleDrawer}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2.5 py-1.5 text-[11px] font-medium text-background transition-colors hover:bg-foreground/90"
          >
            👤 كارت العميل
          </button>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-foreground">{value}</span>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
