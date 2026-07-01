'use client';

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

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time:  'دوام كامل',
  part_time:  'دوام جزئي',
  contract:   'عقد مؤقت',
  freelance:  'فريلانس',
  intern:     'تدريب',
};

const WORK_LOCATION_LABELS: Record<string, string> = {
  onsite:  'مكتبي',
  remote:  'عن بُعد',
  hybrid:  'هجين',
};

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
  const managers = allUsers.filter(
    (u) => u.status === 'active' && (u.role === 'admin' || u.role === 'employee'),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="المسمى الوظيفي بالإنجليزية" required>
        <Input
          className="h-11"
          value={data.titleEn}
          onChange={(e) => onChange({ titleEn: e.target.value })}
          placeholder="Content Creator"
        />
      </Field>
      <Field label="المسمى الوظيفي بالعربية">
        <Input
          className="h-11"
          value={data.titleAr}
          onChange={(e) => onChange({ titleAr: e.target.value })}
          placeholder="منشئ محتوى"
        />
      </Field>
      <Field label="القسم بالإنجليزية">
        <Input
          className="h-11"
          value={data.deptEn}
          onChange={(e) => onChange({ deptEn: e.target.value })}
          placeholder="Marketing"
        />
      </Field>
      <Field label="القسم بالعربية">
        <Input
          className="h-11"
          value={data.deptAr}
          onChange={(e) => onChange({ deptAr: e.target.value })}
          placeholder="التسويق"
        />
      </Field>
      <Field label="المدير المباشر">
        <Select
          value={data.reportsTo || 'none'}
          onValueChange={(v) => onChange({ reportsTo: v === 'none' ? '' : v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="اختر المدير" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون مدير مباشر</SelectItem>
            {managers.map((u) => (
              <SelectItem key={u.username as string} value={u.username as string}>
                {(u.display_name || u.name || u.username) as string}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="تاريخ الالتحاق" required>
        <Input
          type="date"
          className="h-11"
          value={data.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
      </Field>
      <Field label="نوع التوظيف">
        <Select
          value={data.employment_type ?? 'full_time'}
          onValueChange={(v) => onChange({ employment_type: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="اختر نوع التوظيف" />
          </SelectTrigger>
          <SelectContent>
            {(EMPLOYMENT_TYPES as readonly string[]).map((t) => (
              <SelectItem key={t} value={t}>
                {EMPLOYMENT_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="مكان العمل">
        <Select
          value={data.work_location ?? 'onsite'}
          onValueChange={(v) => onChange({ work_location: v })}
        >
          <SelectTrigger className="h-11">
            <SelectValue placeholder="اختر مكان العمل" />
          </SelectTrigger>
          <SelectContent>
            {(WORK_LOCATIONS as readonly string[]).map((l) => (
              <SelectItem key={l} value={l}>
                {WORK_LOCATION_LABELS[l] ?? l}
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
          موظف مبيعات (Sales Agent)
        </Label>
      </div>
    </div>
  );
}
