'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import { SALARY_CURRENCIES, CURRENCY_LABELS_AR } from '@/lib/constants/auth';
import { Field } from './WizardStepPersonal';
import type { Locale } from '@/lib/i18n/config';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

function NumberInput({
  label,
  value,
  onChange,
  suffix,
  required,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix: string;
  required?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <div className="relative">
        <Input
          type="number"
          min={0}
          className="h-11 pe-16"
          value={value || ''}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          placeholder="0"
        />
        <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {suffix}
        </span>
      </div>
    </Field>
  );
}

export function StepCompensation({
  data,
  onChange,
}: {
  data: FormData;
  onChange: OnChange;
}) {
  const t = useTranslations('hr.onboarding.wizard.compensation');
  const locale = useLocale() as Locale;
  const currency = data.currency || 'AED';
  const monthly =
    data.basic + data.housing + data.transport + data.communication + data.other;
  const annual = monthly * 12;
  const numberLocale = locale === 'ar' ? 'ar-AE' : 'en-AE';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('currencyLabel')}>
          <Select
            value={currency}
            onValueChange={(v) => onChange({ currency: v })}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder={t('currencyPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {(SALARY_CURRENCIES as readonly string[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {c} — {CURRENCY_LABELS_AR[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <NumberInput
          label={t('basicLabel')}
          value={data.basic}
          onChange={(n) => onChange({ basic: n })}
          suffix={currency}
          required
        />
        <NumberInput
          label={t('housingLabel')}
          value={data.housing}
          onChange={(n) => onChange({ housing: n })}
          suffix={currency}
        />
        <NumberInput
          label={t('transportLabel')}
          value={data.transport}
          onChange={(n) => onChange({ transport: n })}
          suffix={currency}
        />
        <NumberInput
          label={t('communicationLabel')}
          value={data.communication}
          onChange={(n) => onChange({ communication: n })}
          suffix={currency}
        />
        <NumberInput
          label={t('otherLabel')}
          value={data.other}
          onChange={(n) => onChange({ other: n })}
          suffix={currency}
        />
      </div>

      {/* Totals */}
      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('monthlyTotal')}</p>
          <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
            {monthly.toLocaleString(numberLocale)} {currency}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('annualTotal')}</p>
          <p className="text-lg font-bold">
            {annual.toLocaleString(numberLocale)} {currency}
          </p>
        </div>
      </div>

      {/* Sales-only fields */}
      {data.isSales && (
        <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-orange-200 dark:border-orange-800/40 p-4">
          <p className="sm:col-span-2 text-sm font-semibold text-orange-600 dark:text-orange-400">
            {t('salesSectionTitle')}
          </p>
          <Field label={t('commissionRateLabel')}>
            <Input
              type="number"
              min={0}
              max={100}
              className="h-11"
              value={data.commissionRate ?? ''}
              onChange={(e) =>
                onChange({
                  commissionRate: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder="10"
            />
          </Field>
          <Field label={t('monthlyTargetLabel', { currency })}>
            <Input
              type="number"
              min={0}
              className="h-11"
              value={data.monthlyTarget ?? ''}
              onChange={(e) =>
                onChange({
                  monthlyTarget: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
              placeholder="0"
            />
          </Field>
        </div>
      )}
    </div>
  );
}
