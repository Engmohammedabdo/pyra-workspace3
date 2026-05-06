'use client';

/**
 * Single lead card on the Kanban board.
 *
 * NOT draggable in Phase 4 — drag-and-drop is added in Phase 7 with @dnd-kit.
 * Click navigates to /dashboard/crm/leads/[id]. The whole card is the
 * navigation target via a wrapping <Link>.
 *
 * Quick-action buttons (WhatsApp/Phone) are visible on hover on desktop and
 * always visible on mobile — these stop event propagation so they don't
 * trigger the card-level navigation.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { Phone, MessageCircle } from 'lucide-react';
import { LeadPriorityBadge } from '@/components/crm/lead/lead-priority-badge';
import { LeadSourceIcon } from '@/components/crm/lead/lead-source-icon';
import { formatCurrency } from '@/lib/utils/format';
import type { Lead } from '@/hooks/useLeads';

interface PipelineCardProps {
  lead: Lead;
  /** Compact mode for tighter mobile layouts */
  compact?: boolean;
}

function daysAgoLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return null;
  if (days === 0) return 'اليوم';
  if (days === 1) return 'منذ يوم';
  if (days <= 7) return `منذ ${days} أيام`;
  if (days <= 30) return `منذ ${Math.floor(days / 7)} أسابيع`;
  return `منذ ${Math.floor(days / 30)} شهور`;
}

function whatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}`;
}

export function PipelineCard({ lead, compact = false }: PipelineCardProps) {
  const lastContact = daysAgoLabel(lead.last_contact_at);
  const winProb = lead.win_probability ?? 0;
  const value = Number(lead.expected_value) || 0;
  const currency = lead.expected_value_currency || 'AED';
  const wa = whatsAppHref(lead.phone);

  return (
    <Link
      href={`/dashboard/crm/leads/${lead.id}`}
      className={cn(
        'group relative block rounded-xl border border-border bg-card hover:border-orange-300 dark:hover:border-orange-700/60 hover:shadow-sm transition-all',
        'focus:outline-none focus:ring-2 focus:ring-orange-500/40',
        compact ? 'p-3' : 'p-3.5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 truncate">{lead.name}</h3>
          {lead.company && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.company}</p>
          )}
        </div>
        <LeadPriorityBadge priority={lead.priority} iconOnly />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm font-bold tabular-nums">
          {value > 0 ? formatCurrency(value, currency) : <span className="text-muted-foreground font-normal">—</span>}
        </div>
        {winProb > 0 && (
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-md tabular-nums',
              winProb >= 75 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : winProb >= 50 ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
              : 'bg-muted text-muted-foreground',
            )}
            title="احتمال الفوز"
          >
            {winProb}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <LeadSourceIcon source={lead.source} />
          {lead.deal_type && <span className="truncate">{lead.deal_type}</span>}
        </div>
        {lastContact && <span className="shrink-0">{lastContact}</span>}
      </div>

      {/* Quick actions — appear on hover (desktop) / always (mobile) */}
      {(lead.phone || wa) && (
        <div
          className={cn(
            'absolute end-2 bottom-2 flex items-center gap-1',
            'opacity-0 group-hover:opacity-100 md:transition-opacity',
            'pointer-events-none group-hover:pointer-events-auto',
            'max-md:opacity-100 max-md:pointer-events-auto',
          )}
        >
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="size-7 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="اتصال"
              title="اتصال"
            >
              <Phone className="size-3.5" />
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="size-7 rounded-full bg-background border border-border flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              aria-label="WhatsApp"
              title="WhatsApp"
            >
              <MessageCircle className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </Link>
  );
}
