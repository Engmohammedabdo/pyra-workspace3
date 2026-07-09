'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CreateOnboardingInput } from '@/hooks/useOnboarding';
import type { User } from '@/hooks/useUsers';
import { Field } from './WizardStepPersonal';
import { EMPLOYMENT_TYPES, WORK_LOCATIONS } from '@/lib/constants/auth';
import { useStatusLabels } from '@/lib/i18n/status-labels';

type FormData = CreateOnboardingInput;
type OnChange = (patch: Partial<FormData>) => void;

export function StepPosition({
  data,
  onChange,
  allUsers,
}: {
  data: FormData;
  onChange: OnChange;
  allUsers: User[];
}) {
  const t = useTranslations('hr.onboarding.wizard.position');
  const employmentTypeLabel = useStatusLabels('employmentType');
  const workLocationLabel = useStatusLabels('workLocation');
  const managers = allUsers.filter(
    (u) => u.status === 'active' && (u.role === 'admin' || u.role === 'employee'),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('titleEnLabel')} required>
        <Input
          className="h-11"
          value={data.titleEn}
          onChange={(e) => onChange({ titleEn: e.target.value })}
          placeholder="Content Creator"
        />
      </Field>
      <Field label={t('titleArLabel')}>
        <Input
          className="h-11"
          value={data.titleAr}
          onChange={(e) => onChange({ titleAr: e.target.value })}
          placeholder="منشئ محتوى" // i18n-exempt: Arabic example placeholder for an Arabic-only job-title field
        />
      </Field>
      <Field label={t('deptEnLabel')}>
        <Input
          className="h-11"
          value={data.deptEn}
          onChange={(e) => onChange({ deptEn: e.target.value })}
          placeholder="Marketing"
        />
      </Field>
      <Field label={t('deptArLabel')}>
        <Input
          className="h-11"
          value={data.deptAr}
          onChange={(e) => onChange({ deptAr: e.target.value })}
          placeholder="التسويق" // i18n-exempt: Arabic example placeholder for an Arabic-only department field
        />
      </Field>
      <Field label={t('managerLabel')}>
        <Select
          value={data.reportsTo || 'none'}
          onValueChange={(v) => onChange({ reportsTo: v === 'none' ? '' : v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder={t('managerPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t('noManager')}</SelectItem>
            {managers.map((u) => (
              <SelectItem key={u.username as string} value={u.username as string}>
                {(u.display_name || u.name || u.username) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('startDateLabel')} required>
        <Input
          type="date"
          className="h-11"
          value={data.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
      </Field>
      <Field label={t('employmentTypeLabel')}>
        <Select
          value={data.employment_type ?? 'full_time'}
          onValueChange={(v) => onChange({ employment_type: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder={t('employmentTypePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {(EMPLOYMENT_TYPES as readonly string[]).map((et) => (
              <SelectItem key={et} value={et}>
                {employmentTypeLabel(et)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t('workLocationLabel')}>
        <Select
          value={data.work_location ?? 'onsite'}
          onValueChange={(v) => onChange({ work_location: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder={t('workLocationPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {(WORK_LOCATIONS as readonly string[]).map((l) => (
              <SelectItem key={l} value={l}>
                {workLocationLabel(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="sm:col-span-2 flex items-center gap-3 rounded-lg border p-4">
        <Switch
          id="isSales"
          checked={data.isSales}
          onCheckedChange={(v) => onChange({ isSales: v })}
        />
        <Label htmlFor="isSales" className="cursor-pointer">
          {t('isSalesLabel')}
        </Label>
      </div>
    </div>
  );
}
