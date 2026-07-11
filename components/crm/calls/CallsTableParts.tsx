'use client';

/**
 * Presentational pieces for CallsTable (V1.1-A fix round 1) — split out to
 * keep CallsTable.tsx under the <300-line file-size mandate. No behavior
 * lives here: just the filter-chip pill, the match-status badge, and the
 * direction→icon map.
 */

import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { PhoneOutgoing, PhoneIncoming, PhoneMissed } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import type { CallsListCall } from '@/hooks/useCallsList';

export const DIRECTION_ICON: Record<
  CallsListCall['direction'],
  ComponentType<{ className?: string }>
> = {
  outgoing: PhoneOutgoing,
  incoming: PhoneIncoming,
  missed: PhoneMissed,
};

// Chip button shared by both filter rows (direction + status) — same pill
// idiom as the CRM follow-ups filter chips (app/dashboard/crm/follow-ups).
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

export function CallStatusBadge({ status }: { status: CallsListCall['match_status'] }) {
  const t = useTranslations('calls');
  const tone =
    status === 'matched'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
      : status === 'unmatched'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
        : 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/40';
  return (
    <Badge variant="outline" className={cn('text-xs', tone)}>
      {t(status)}
    </Badge>
  );
}
