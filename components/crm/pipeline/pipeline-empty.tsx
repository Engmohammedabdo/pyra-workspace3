'use client';

import { useTranslations } from 'next-intl';
import { Inbox } from 'lucide-react';

/**
 * Compact empty state shown inside an empty pipeline column.
 * (We don't reuse the full <EmptyState> here — it's too heavy for a column.)
 *
 * Phase 3.3: the original split-node sentence ("لا توجد صفقات في" + // i18n-exempt: doc comment
 * <span>{stageLabel}</span> + "حالياً.") became a single ICU message with a // i18n-exempt: doc comment
 * {stage} placeholder — stageLabel itself stays DB data (name_ar), just
 * relocated into the interpolation param.
 */
export function PipelineEmpty({ stageLabel }: { stageLabel: string }) {
  const t = useTranslations('crm.pipeline.empty');
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-3 rounded-lg border border-dashed border-border bg-muted/20 text-muted-foreground">
      <Inbox className="size-6 mb-2 opacity-60" aria-hidden />
      <p className="text-xs leading-5">
        {t.rich('message', {
          stage: stageLabel,
          stageTag: (chunks) => <span className="font-medium mx-1">{chunks}</span>,
        })}
      </p>
    </div>
  );
}
