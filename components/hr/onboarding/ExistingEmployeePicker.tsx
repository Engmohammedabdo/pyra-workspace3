'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { User } from '@/hooks/useUsers';

// ────────────────────────────────────────────────────────────────────────────
// ExistingEmployeePicker — active employees / sales agents dropdown for the
// wizard's "موظف حالي" mode. Users who already have an onboarding record are
// rendered disabled with a "(لديه سجل)" suffix. Selecting a user hands the
// full row back to the wizard so it can prefill the form.
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  users: User[];
  /** Currently selected username ('' = none). */
  value: string;
  onSelect: (user: User) => void;
}

export function ExistingEmployeePicker({ users, value, onSelect }: Props) {
  const eligible = users.filter(
    (u) =>
      u.status === 'active' &&
      (u.role === 'employee' || u.role === 'sales_agent'),
  );

  return (
    <div className="space-y-1.5 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-950/30 p-4">
      <Label className="text-sm font-medium">
        الموظف الحالي
        <span className="text-destructive ms-0.5">*</span>
      </Label>
      <Select
        value={value || undefined}
        onValueChange={(username) => {
          const user = eligible.find((u) => u.username === username);
          if (user) onSelect(user);
        }}
      >
        <SelectTrigger className="h-11 bg-background">
          <SelectValue placeholder="اختر الموظف" />
        </SelectTrigger>
        <SelectContent>
          {eligible.length === 0 && (
            <SelectItem value="__none__" disabled>
              لا يوجد موظفون نشطون
            </SelectItem>
          )}
          {eligible.map((u) => {
            const hasRecord = Boolean(u.onboarding_id);
            return (
              <SelectItem
                key={u.username as string}
                value={u.username as string}
                disabled={hasRecord}
              >
                {(u.display_name || u.name || u.username) as string}
                {hasRecord ? ' (لديه سجل)' : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        سيتم تعبئة البيانات تلقائياً من سجل الموظف — يمكنك تعديلها قبل التوليد.
      </p>
    </div>
  );
}
