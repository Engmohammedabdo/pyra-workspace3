'use client';

import { Sparkles } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import type { HROverview } from '@/hooks/useHROverview';

interface CelebrationsCardProps {
  items: HROverview['celebrations'];
}

export function CelebrationsCard({ items }: CelebrationsCardProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center shadow-md shadow-pink-500/15">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">مناسبات قريبة</h3>
      </div>

      {/* Body */}
      <div className="divide-y divide-border/40">
        {items && items.length > 0 ? (
          items.map((item) => {
            const emoji = item.kind === 'birthday' ? '🎂' : '🎉';
            const dayLabel = formatDate(item.date, 'd MMMM');

            return (
              <div
                key={`${item.username}-${item.kind}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
              >
                <span className="text-xl shrink-0" aria-hidden>{emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.display_name}</p>
                  {item.kind === 'anniversary' && item.years != null && (
                    <p className="text-xs text-muted-foreground">
                      {item.years} {item.years === 1 ? 'سنة' : 'سنوات'}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{dayLabel}</span>
              </div>
            );
          })
        ) : (
          /* Phase 13 compact inline stub */
          <div className="px-5 py-5">
            <p className="text-sm text-muted-foreground">لا توجد مناسبات قريبة</p>
          </div>
        )}
      </div>
    </div>
  );
}
