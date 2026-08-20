'use client';

/**
 * Per-day WhatsApp activity — a simple bar list (Task 9 brief explicitly
 * allows this instead of reusing components/crm/calls/CallsByDayChart,
 * which is wired to the 'calls' namespace). Dates and counts render LTR/
 * tabular regardless of UI direction (CLAUDE.md numerics rule).
 */

import { useLocale, useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';

interface WaByDayChartProps {
  perDay: Record<string, number>;
}

export function WaByDayChart({ perDay }: WaByDayChartProps) {
  const t = useTranslations('whatsapp-report');
  const locale = useLocale() as Locale;

  // per_day keys are YYYY-MM-DD — sort chronologically.
  const rows = Object.entries(perDay).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const max = Math.max(1, ...rows.map(([, count]) => count));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
          <MessageCircle className="h-4 w-4 text-white" aria-hidden />
        </div>
        <h3 className="font-bold text-sm">{t('byDay')}</h3>
      </div>

      <div className="p-5">
        {rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map(([day, count]) => (
              <div key={day} className="flex items-center gap-3" title={formatDate(day, undefined, locale)}>
                <span className="w-9 shrink-0 text-xs text-muted-foreground tabular-nums" dir="ltr">
                  {day.slice(8, 10)}
                </span>
                <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500"
                    style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-end text-xs font-semibold tabular-nums" dir="ltr">
                  {count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{t('emptyTitle')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
