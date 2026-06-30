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
