'use client';

/**
 * Render an icon for the lead's source. Supports the legacy enum
 * (whatsapp / website / referral / manual / ad / social) plus the v1
 * extensions in the PRD (whatsapp_direct / instagram_dm / cold_outreach
 * / events). Unknown values fall back to a neutral globe.
 */

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

const SOURCE_MAP: Record<string, { icon: IconType; label: string; tone: string }> = {
  whatsapp:        { icon: MessageCircle, label: 'WhatsApp',        tone: 'text-emerald-600 dark:text-emerald-400' },
  whatsapp_direct: { icon: MessageCircle, label: 'WhatsApp مباشر',   tone: 'text-emerald-600 dark:text-emerald-400' },
  instagram_dm:    { icon: Instagram,     label: 'Instagram DM',    tone: 'text-pink-600 dark:text-pink-400' },
  social:          { icon: Instagram,     label: 'سوشيال ميديا',     tone: 'text-pink-600 dark:text-pink-400' },
  website:         { icon: Globe,         label: 'الموقع',          tone: 'text-sky-600 dark:text-sky-400' },
  referral:        { icon: Users2,        label: 'إحالة',           tone: 'text-amber-600 dark:text-amber-400' },
  manual:          { icon: Hand,          label: 'إضافة يدوية',      tone: 'text-muted-foreground' },
  ad:              { icon: Megaphone,     label: 'إعلان',           tone: 'text-orange-600 dark:text-orange-400' },
  events:          { icon: CalendarDays,  label: 'فعالية',          tone: 'text-indigo-600 dark:text-indigo-400' },
  cold_outreach:   { icon: PhoneOutgoing, label: 'تواصل بارد',      tone: 'text-stone-600 dark:text-stone-400' },
};

export interface LeadSourceIconProps {
  source: string | null | undefined;
  showLabel?: boolean;
  className?: string;
}

export function LeadSourceIcon({ source, showLabel, className }: LeadSourceIconProps) {
  const key = (source ?? '').toLowerCase();
  const entry = SOURCE_MAP[key] ?? { icon: HelpCircle, label: source ?? 'غير معروف', tone: 'text-muted-foreground' };
  const Icon = entry.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', entry.tone, className)} title={entry.label}>
      <Icon className="size-3.5" />
      {showLabel && <span>{entry.label}</span>}
    </span>
  );
}
