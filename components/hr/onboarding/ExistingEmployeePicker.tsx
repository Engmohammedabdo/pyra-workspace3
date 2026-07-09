'use client';

import { useTranslations } from 'next-intl';
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
// wizard's "existing employee" mode. Users who already have an onboarding
// record are rendered disabled with a translated "has a record" suffix.
// Selecting a user hands the full row back to the wizard so it can prefill
// the form.
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  users: User[];
  /** Currently selected username ('' = none). */
  value: string;
  onSelect: (user: User) => void;
  /** True while the users list is still fetching — shows a loading row instead of the misleading empty-state. */
  loading?: boolean;
}

export function ExistingEmployeePicker({ users, value, onSelect, loading }: Props) {
  const t = useTranslations('hr.onboarding.wizard.picker');
  const eligible = users.filter(
    (u) =>
      u.status === 'active' &&
      (u.role === 'employee' || u.role === 'sales_agent'),
  );

  return (
    <div className="space-y-1.5 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-950/30 p-4">
      <Label className="text-sm font-medium">
        {t('label')}
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
          <SelectValue placeholder={t('placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {loading && eligible.length === 0 && (
            <SelectItem value="__loading__" disabled>
              {t('loading')}
            </SelectItem>
          )}
          {!loading && eligible.length === 0 && (
            <SelectItem value="__none__" disabled>
              {t('noneActive')}
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
                {hasRecord ? t('hasRecordSuffix') : ''}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {t('hint')}
      </p>
    </div>
  );
}
