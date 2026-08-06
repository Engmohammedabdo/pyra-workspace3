'use client';

/**
 * StagePickerSheet — the one stage list in the product.
 *
 * Generalized from the pipeline-card-only MobileStageSheet so the lead detail
 * page's «نقل لمرحلة» button and the pipeline card's mobile button render the // i18n-exempt: doc comment
 * same rows with the same rules. It takes `leadName` + `options` instead of a
 * pipeline `Lead`, so it has no dependency on the board's data shape.
 *
 * A refused stage renders disabled with its reason underneath rather than
 * vanishing — a sales agent who cannot reach «تم توقيع العقد» should learn why, // i18n-exempt: doc comment
 * not wonder where the stage went.
 */

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
import type { PipelineStage } from '@/hooks/usePipelineStages';
import type { StageOption } from '@/lib/crm/stage-options';

export interface StagePickerSheetProps {
  /** Sheet visibility — controlled by the parent. */
  open: boolean;
  /** Called on ESC, backdrop, X, AND after the user picks a stage. */
  onOpenChange: (open: boolean) => void;
  /** Shown in the sheet description for context. */
  leadName: string;
  /** Stage rows — supplies the display name and colour for each option. */
  stages: PipelineStage[];
  /** Which stages to offer and why one is refused. From buildStageOptions(). */
  options: StageOption[];
  /** Fired with the chosen stage id. The sheet closes itself afterwards. */
  onSelectStage: (toStageId: string) => void;
}

export default function StagePickerSheet({
  open,
  onOpenChange,
  leadName,
  stages,
  options,
  onSelectStage,
}: StagePickerSheetProps) {
  const t = useTranslations('crm.pipeline.stagePicker');
  const locale = useLocale();
  // Stage rows are bilingual DB data (name + name_ar) — pick by locale.
  const stageName = (s: { name: string; name_ar: string }) =>
    locale === 'ar' ? s.name_ar : (s.name || s.name_ar);

  const rows = options
    .map((option) => ({ option, stage: stages.find((s) => s.id === option.id) }))
    .filter((row): row is { option: StageOption; stage: PipelineStage } => !!row.stage);

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
            {t('description', { name: leadName })}
          </SheetDescription>
        </SheetHeader>

        {rows.length === 0 ? (
          <div className="px-6 pb-6 pt-2 text-center text-sm text-muted-foreground">
            {t('noOtherStages')}
          </div>
        ) : (
          <div className="px-2 pb-4 max-h-[55vh] overflow-y-auto">
            {rows.map(({ option, stage }) => (
              <button
                key={stage.id}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  onSelectStage(stage.id);
                  onOpenChange(false);
                }}
                aria-label={t('moveToAria', { stage: stageName(stage) })}
                className={cn(
                  'w-full px-4 py-3 rounded-lg transition-colors flex items-center gap-3',
                  option.disabled
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:bg-muted/60',
                )}
              >
                <span
                  className={cn(
                    'size-2.5 rounded-full shrink-0',
                    ACCENT_DOT[stage.color] ?? 'bg-current',
                  )}
                  aria-hidden
                />
                <span className="flex-1 min-w-0 text-start">
                  <span className="block font-medium text-sm">{stageName(stage)}</span>
                  {option.reason && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {t(`disabledReasons.${option.reason}`)}
                    </span>
                  )}
                </span>
                {/* ChevronLeft = visual "forward" arrow in RTL (points toward
                    the row's end, since text flows right-to-left). Phase 15.1
                    §7 lock: LTR-semantic icon name + rtl:rotate-180 utility so
                    the icon mirrors correctly if this sheet renders LTR (EN
                    locale) — SVGs don't auto-mirror on their own. */}
                {!option.disabled && (
                  <ChevronLeft
                    className="size-4 text-muted-foreground shrink-0 rtl:rotate-180"
                    aria-hidden
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
