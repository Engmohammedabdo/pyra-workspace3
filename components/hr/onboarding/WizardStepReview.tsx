'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import { Field } from './WizardStepPersonal';
import { Input } from '@/components/ui/input';
import {
  WIZARD_DOC_KEYS,
  WIZARD_DOC_NAME_KEYS,
  type WizardMode,
} from './wizard-helpers';
import type { Locale } from '@/lib/i18n/config';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

export function StepReview({
  data,
  onChange,
  mode = 'new',
}: {
  data: FormData;
  onChange: OnChange;
  /** Existing mode shows document-selection checkboxes + adjusted note. */
  mode?: WizardMode;
}) {
  const t = useTranslations('hr.onboarding.wizard');
  const tDocNames = useTranslations('hr.onboarding.docNames');
  const locale = useLocale() as Locale;
  const currency = data.currency || 'AED';
  const monthly =
    data.basic + data.housing + data.transport + data.communication + data.other;
  const selectedDocs = data.documents ?? [...WIZARD_DOC_KEYS];
  const numberLocale = locale === 'ar' ? 'ar-AE' : 'en-AE';

  function toggleDoc(key: string, checked: boolean) {
    const next = checked
      ? [...selectedDocs, key]
      : selectedDocs.filter((d) => d !== key);
    onChange({ documents: next });
  }

  return (
    <div className="space-y-6">
      {/* Signatory fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('review.signatoryNameLabel')} required>
          <Input
            className="h-11"
            value={data.signatoryName}
            onChange={(e) => onChange({ signatoryName: e.target.value })}
            placeholder="Mohammed Al-Harbi"
          />
        </Field>
        <Field label={t('review.signatoryTitleLabel')} required>
          <Input
            className="h-11"
            value={data.signatoryTitle}
            onChange={(e) => onChange({ signatoryTitle: e.target.value })}
            placeholder="CEO / HR Manager"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('review.notesLabel')}>
            <Textarea
              className="min-h-[72px] resize-none"
              placeholder={t('review.notesPlaceholder')}
              value={data.notes ?? ''}
              onChange={(e) =>
                onChange({ notes: e.target.value || undefined })
              }
            />
          </Field>
        </div>
      </div>

      {/* Documents selection — existing mode only (new hires always get all 3) */}
      {mode === 'existing' && (
        <div className="rounded-lg border border-orange-200 dark:border-orange-800/40 p-4 space-y-3">
          <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
            {t('review.documentsToGenerate')}
          </p>
          <div className="space-y-2">
            {WIZARD_DOC_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <Checkbox
                  id={`doc-${key}`}
                  checked={selectedDocs.includes(key)}
                  onCheckedChange={(v) => toggleDoc(key, v === true)}
                />
                <Label htmlFor={`doc-${key}`} className="cursor-pointer text-sm">
                  {tDocNames(WIZARD_DOC_NAME_KEYS[key])}
                </Label>
              </div>
            ))}
          </div>
          {selectedDocs.length === 0 && (
            <p className="text-xs text-destructive">{t('validation.selectAtLeastOneDocument')}</p>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-4 space-y-3 text-sm">
        <p className="font-semibold text-base">{t('review.summaryTitle')}</p>
        <div className="grid grid-cols-2 gap-y-2 gap-x-6">
          <span className="text-muted-foreground">{t('review.summaryName')}</span>
          <span className="font-medium">{data.nameAr || data.nameEn || '—'}</span>
          <span className="text-muted-foreground">{t('review.summaryJobTitle')}</span>
          <span className="font-medium">{data.titleAr || data.titleEn || '—'}</span>
          <span className="text-muted-foreground">{t('review.summaryStartDate')}</span>
          <span className="font-medium">{data.startDate || '—'}</span>
          <span className="text-muted-foreground">{t('review.summaryMonthlyTotal')}</span>
          <span className="font-medium text-orange-600 dark:text-orange-400">
            {monthly.toLocaleString(numberLocale)} {currency}
          </span>
          <span className="text-muted-foreground">{t('review.summaryAssetCount')}</span>
          <span className="font-medium">{data.assets.length}</span>
          <span className="text-muted-foreground">{t('review.summaryClauseCount')}</span>
          <span className="font-medium">{data.customClauses.length}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {mode === 'existing'
          ? t('review.hintExisting', { label: t('submitExisting') })
          : t('review.hintNew', { label: t('submitNew') })}
      </p>
    </div>
  );
}
