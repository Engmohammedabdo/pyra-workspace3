'use client';

import { useTranslations, useLocale } from 'next-intl';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ACCENT_DOT } from '@/lib/constants/pipeline-colors';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';

export interface MobileStageSheetProps {
  /** Sheet visibility — controlled by parent (per-card useState in PipelineCard). */
  open: boolean;
  /** Called when the sheet should close (ESC, backdrop, X button, AND after user selects a stage). */
  onOpenChange: (open: boolean) => void;
  /** The lead being moved. Used for the sheet title context + filtering out the current stage. */
  lead: Lead;
  /** All pipeline stages. The current stage (lead.stage_id) is filtered out client-side. */
  stages: PipelineStage[];
  /** Called when user picks a target stage. Sheet auto-closes via onOpenChange(false) AFTER this callback fires. */
  onSelectStage: (toStageId: string) => void;
}

export default function MobileStageSheet({
  open,
  onOpenChange,
  lead,
  stages,
  onSelectStage,
}: MobileStageSheetProps) {
  const t = useTranslations('crm.pipeline.mobileStageSheet');
  const locale = useLocale();
  // Stage rows are bilingual DB data (name + name_ar) — pick by locale.
  const stageName = (s: { name: string; name_ar: string }) =>
    locale === 'ar' ? s.name_ar : (s.name || s.name_ar);
  const otherStages = stages.filter((s) => s.id !== lead.stage_id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Override the default `p-6` from sheetVariants with `p-0` so the body
          controls its own padding. Bottom sheet rounds only the TOP corners. */}
      <SheetContent
        side="bottom"
        className="h-auto max-h-[80vh] rounded-t-2xl p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>
            {t('description', { name: lead.name })}
          </SheetDescription>
        </SheetHeader>

        {otherStages.length === 0 ? (
          <div className="px-6 pb-6 pt-2 text-center text-sm text-muted-foreground">
            {t('noOtherStages')}
          </div>
        ) : (
          <div className="px-2 pb-4 max-h-[55vh] overflow-y-auto">
            {otherStages.map((stage) => (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  onSelectStage(stage.id);
                  onOpenChange(false);
                }}
                aria-label={t('moveToAria', { stage: stageName(stage) })}
                className="w-full px-4 py-3 rounded-lg hover:bg-muted/60 transition-colors flex items-center gap-3"
              >
                <span
                  className={cn(
                    'size-2.5 rounded-full shrink-0',
                    ACCENT_DOT[stage.color] ?? 'bg-current',
                  )}
                  aria-hidden
                />
                <span className="flex-1 text-start font-medium text-sm">
                  {stageName(stage)}
                </span>
                {/* ChevronLeft = visual "forward" arrow in RTL (points toward
                    the row's end, since text flows right-to-left). Phase 15.1
                    §7 lock: LTR-semantic icon name + rtl:rotate-180 utility so
                    the icon mirrors correctly if this sheet ever renders LTR
                    (EN locale) — SVGs don't auto-mirror on their own. */}
                <ChevronLeft
                  className="size-4 text-muted-foreground shrink-0 rtl:rotate-180"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
