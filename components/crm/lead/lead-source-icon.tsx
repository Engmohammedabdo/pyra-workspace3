'use client';

/**
 * Render an icon for the lead's source. Supports the legacy enum
 * (whatsapp / website / referral / manual / ad / social) plus the v1
 * extensions in the PRD (whatsapp_direct / instagram_dm / cold_outreach
 * / events) and `phone_call` from the call-tracking app. Unknown values fall
 * back to a neutral question mark.
 *
 * `pyra_sales_leads.source` has NO database constraint, so this map is the only
 * thing standing between a new writer and a wall of question marks — add the
 * entry in the same change that starts writing a new value.
 */

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import {
  MessageCircle,
  Globe,
  Users2,
  Hand,
  Megaphone,
  Instagram,
  CalendarDays,
  PhoneOutgoing,
  PhoneCall,
  HelpCircle,
} from 'lucide-react';

type IconType = React.ComponentType<{ className?: string }>;

// Icons + tones only — labels resolved in-component via t() from
// `crm.lead.sources.*` (Phase 3.4 restructure, module maps can't call hooks).
const SOURCE_MAP: Record<string, { icon: IconType; tone: string }> = {
  whatsapp:        { icon: MessageCircle, tone: 'text-emerald-600 dark:text-emerald-400' },
  whatsapp_direct: { icon: MessageCircle, tone: 'text-emerald-600 dark:text-emerald-400' },
  instagram_dm:    { icon: Instagram,     tone: 'text-pink-600 dark:text-pink-400' },
  social:          { icon: Instagram,     tone: 'text-pink-600 dark:text-pink-400' },
  website:         { icon: Globe,         tone: 'text-sky-600 dark:text-sky-400' },
  referral:        { icon: Users2,        tone: 'text-amber-600 dark:text-amber-400' },
  manual:          { icon: Hand,          tone: 'text-muted-foreground' },
  ad:              { icon: Megaphone,     tone: 'text-orange-600 dark:text-orange-400' },
  events:          { icon: CalendarDays,  tone: 'text-indigo-600 dark:text-indigo-400' },
  cold_outreach:   { icon: PhoneOutgoing, tone: 'text-stone-600 dark:text-stone-400' },
  // T-04 — and not a cosmetic gap: `phone_call` is the LARGEST source in the
  // CRM at 777 of 1,260 leads (62%, measured 2026-08-10). Every one of them was
  // rendering as the unknown-value fallback, so the most common origin in the
  // pipeline showed a question mark. Written by the call-tracking app's
  // quick-add flow when a rep turns an unmatched number into a lead.
  //
  // Distinct tone from cold_outreach despite sharing the phone metaphor: an
  // inbound-driven call from the app is not an outbound cold dial, and they sit
  // side by side on the same board.
  phone_call:      { icon: PhoneCall,     tone: 'text-teal-600 dark:text-teal-400' },
};

export interface LeadSourceIconProps {
  source: string | null | undefined;
  showLabel?: boolean;
  className?: string;
}

export function LeadSourceIcon({ source, showLabel, className }: LeadSourceIconProps) {
  const t = useTranslations('crm.lead.sources');
  const key = (source ?? '').toLowerCase();
  const entry = SOURCE_MAP[key] ?? { icon: HelpCircle, tone: 'text-muted-foreground' };
  const label = t.has(key as Parameters<typeof t>[0]) ? t(key as Parameters<typeof t>[0]) : (source ?? t('unknown'));
  const Icon = entry.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', entry.tone, className)} title={label}>
      <Icon className="size-3.5" />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
