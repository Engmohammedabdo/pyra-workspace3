'use client';

/**
 * Render an icon for the lead's source. Supports the legacy enum
 * (whatsapp / website / referral / manual / ad / social) plus the v1
 * extensions in the PRD (whatsapp_direct / instagram_dm / cold_outreach
 * / events). Unknown values fall back to a neutral globe.
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
