'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXIT_REASONS } from '@/lib/constants/offboarding';
import type { ExitForm } from './exit-wizard-helpers';

type OnChange = (patch: Partial<ExitForm>) => void;

/** Small labelled field wrapper — shared with ExitStepHandover. */
export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export function ExitStepDetails({
  form,
  onChange,
  todayKey,
}: {
  form: ExitForm;
  onChange: OnChange;
  todayKey: string;
}) {
  const t = useTranslations('hr.offboarding');
  return (
    <div className="space-y-4">
      <Field label={t('fields.lastWorkingDay')} required>
        <Input
          type="date"
          className="h-11"
          max={todayKey}
          value={form.last_working_day}
          onChange={(e) => onChange({ last_working_day: e.target.value })}
        />
      </Field>

      <Field label={t('fields.exitReason')} required>
        <Select
          value={form.exit_reason}
          onValueChange={(v) => onChange({ exit_reason: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXIT_REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`exitReasons.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label={t('fields.notes')}>
        <Textarea
          rows={3}
          value={form.exit_notes}
          onChange={(e) => onChange({ exit_notes: e.target.value })}
          placeholder={t('fields.notesPlaceholder')}
        />
      </Field>
    </div>
  );
}
