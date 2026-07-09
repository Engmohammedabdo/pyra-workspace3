'use client';

import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import type { WizardMode } from './wizard-helpers';
import { PASSWORD_MIN_LENGTH } from '@/lib/constants/auth';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

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

export function StepPersonal({
  data,
  onChange,
  mode = 'new',
}: {
  data: FormData;
  onChange: OnChange;
  /** Existing mode hides account fields — username comes from the picker. */
  mode?: WizardMode;
}) {
  const t = useTranslations('hr.onboarding.wizard.personal');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('nameEnLabel')} required>
        <Input
          className="h-11"
          value={data.nameEn}
          onChange={(e) => onChange({ nameEn: e.target.value })}
          placeholder="Full name in English"
        />
      </Field>
      <Field label={t('nameArLabel')} required>
        <Input
          className="h-11"
          value={data.nameAr}
          onChange={(e) => onChange({ nameAr: e.target.value })}
          placeholder="الاسم الكامل بالعربية" // i18n-exempt: Arabic example placeholder for an Arabic-only name field
        />
      </Field>
      <Field label={t('nationalityLabel')}>
        <Input
          className="h-11"
          value={data.nationality}
          onChange={(e) => onChange({ nationality: e.target.value })}
          placeholder="Egyptian / Jordanian / etc."
        />
      </Field>
      <Field label={t('passportLabel')}>
        <Input
          className="h-11"
          value={data.passport}
          onChange={(e) => onChange({ passport: e.target.value })}
        />
      </Field>
      <Field label={t('idNumberLabel')}>
        <Input
          className="h-11"
          value={data.idNumber}
          onChange={(e) => onChange({ idNumber: e.target.value })}
        />
      </Field>
      <Field label={t('dateOfBirthLabel')}>
        <Input
          type="date"
          className="h-11"
          value={data.dateOfBirth ?? ''}
          onChange={(e) => onChange({ dateOfBirth: e.target.value || undefined })}
        />
      </Field>
      <Field label={t('phoneLabel')}>
        <Input
          className="h-11"
          value={data.phone ?? ''}
          onChange={(e) => onChange({ phone: e.target.value || undefined })}
          placeholder="+971 5X XXX XXXX"
        />
      </Field>
      <Field label={t('emailLabel')}>
        <Input
          type="email"
          className="h-11"
          value={data.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value || undefined })}
          placeholder="employee@example.com"
        />
      </Field>
      {mode === 'new' && (
        <>
          <Field label={t('usernameLabel')} required>
            <Input
              className="h-11"
              value={data.username}
              onChange={(e) => onChange({ username: e.target.value })}
              placeholder="firstname.lastname"
              dir="ltr"
            />
          </Field>
          <Field label={t('passwordLabel')} required>
            <Input
              type="password"
              className="h-11"
              value={data.password ?? ''}
              onChange={(e) => onChange({ password: e.target.value })}
              placeholder={t('passwordPlaceholder', { min: PASSWORD_MIN_LENGTH })}
              dir="ltr"
            />
          </Field>
        </>
      )}
    </div>
  );
}
