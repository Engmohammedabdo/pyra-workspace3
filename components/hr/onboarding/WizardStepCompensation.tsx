'use client';

import { Input } from '@/components/ui/input';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import { Field } from './WizardStepPersonal';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

function NumberInput({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
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
          د.إ
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
  const monthly =
    data.basic + data.housing + data.transport + data.communication + data.other;
  const annual = monthly * 12;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberInput
          label="الراتب الأساسي"
          value={data.basic}
          onChange={(n) => onChange({ basic: n })}
          required
        />
        <NumberInput
          label="بدل السكن"
          value={data.housing}
          onChange={(n) => onChange({ housing: n })}
        />
        <NumberInput
          label="بدل المواصلات"
          value={data.transport}
          onChange={(n) => onChange({ transport: n })}
        />
        <NumberInput
          label="بدل الاتصالات"
          value={data.communication}
          onChange={(n) => onChange({ communication: n })}
        />
        <NumberInput
          label="بدلات أخرى"
          value={data.other}
          onChange={(n) => onChange({ other: n })}
        />
      </div>

      {/* Totals */}
      <div className="rounded-lg border bg-muted/30 dark:bg-muted/10 p-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">الإجمالي الشهري</p>
          <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
            {monthly.toLocaleString('ar-AE')} د.إ
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">الإجمالي السنوي</p>
          <p className="text-lg font-bold">
            {annual.toLocaleString('ar-AE')} د.إ
          </p>
        </div>
      </div>

      {/* Sales-only fields */}
      {data.isSales && (
        <div className="grid gap-4 sm:grid-cols-2 rounded-lg border border-orange-200 dark:border-orange-800/40 p-4">
          <p className="sm:col-span-2 text-sm font-semibold text-orange-600 dark:text-orange-400">
            إعدادات المبيعات
          </p>
          <Field label="نسبة العمولة (%)">
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
          <Field label="الهدف الشهري (د.إ)">
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
