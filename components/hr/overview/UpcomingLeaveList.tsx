'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils/format';
import type { HROverview } from '@/hooks/useHROverview';
import type { Locale } from '@/lib/i18n/config';

interface UpcomingLeaveListProps {
  items: HROverview['leave']['upcoming'];
}

export function UpcomingLeaveList({ items }: UpcomingLeaveListProps) {
  const t = useTranslations('hr.overview.upcomingLeave');
  const tDays = useTranslations('hr.overview.daysLabel');
  const locale = useLocale() as Locale;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Section header — whole header is a Link (section-header-as-link pattern) */}
      <Link
        href="/dashboard/approvals"
        aria-label={t('openAria')}
        className={cn(
          'group flex items-center justify-between px-5 py-4 border-b border-border/40',
          'hover:bg-muted/50 transition-colors cursor-pointer',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/15">
            <CalendarDays className="h-4 w-4 text-white" />
          </div>
          <h3 className="font-bold text-sm">{t('title')}</h3>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {items.length}
            </Badge>
          )}
        </div>
        <ArrowUpRight
          className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-90"
          aria-hidden
        />
      </Link>

      {/* Body */}
      <div className="divide-y divide-border/40">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={`${item.username}-${item.start_date}`}
              className="flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium truncate">{item.display_name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(item.start_date, undefined, locale)} — {formatDate(item.end_date, undefined, locale)}
                </span>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 ms-3 text-xs border-amber-300 text-amber-700 dark:border-amber-700/60 dark:text-amber-400"
              >
                {item.days} {item.days === 1 ? tDays('one') : tDays('other')}
              </Badge>
            </div>
          ))
        ) : (
          /* Phase 13 compact inline stub */
          <div className="px-5 py-6 flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
