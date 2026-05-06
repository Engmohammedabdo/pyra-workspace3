'use client';

import { Inbox } from 'lucide-react';

/**
 * Compact empty state shown inside an empty pipeline column.
 * (We don't reuse the full <EmptyState> here — it's too heavy for a column.)
 */
export function PipelineEmpty({ stageLabel }: { stageLabel: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-3 rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground">
      <Inbox className="size-6 mb-2 opacity-60" aria-hidden />
      <p className="text-xs leading-5">
        لا توجد صفقات في
        <span className="font-medium mx-1">{stageLabel}</span>
        حالياً.
      </p>
    </div>
  );
}
