'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

interface KpiProgressEditorProps {
  kpiId: string;
  currentValue: number;
  /** Called after a successful save so the caller can refetch its KPI list */
  onSaved: () => void;
}

/**
 * Inline "Update Progress" editor for a single KPI row.
 * PATCHes /api/dashboard/kpi/{id} with the new actual_value.
 * Gated by the caller on `evaluations.manage` — this component assumes
 * the viewer is already authorized to edit.
 */
export function KpiProgressEditor({ kpiId, currentValue, onSaved }: KpiProgressEditorProps) {
  const t = useTranslations('hr.evaluations.kpiProgressEditor');
  const [value, setValue] = useState(String(currentValue));

  const mutation = useMutation({
    mutationFn: (actual_value: number) =>
      mutateAPI(`/api/dashboard/kpi/${kpiId}`, 'PATCH', { actual_value }),
    onSuccess: () => {
      toast.success(t('toasts.saveSuccess'));
      onSaved();
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t('toasts.saveFailed'));
    },
  });

  const handleSave = () => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) {
      toast.error(t('toasts.invalidValue'));
      return;
    }
    mutation.mutate(num);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{t('label')}</span>
      <Input
        type="number"
        min={0}
        dir="ltr"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-24 text-sm"
      />
      <Button
        size="sm"
        variant="outline"
        onClick={handleSave}
        disabled={mutation.isPending}
        className="h-8 gap-1.5"
      >
        <Save className="h-3.5 w-3.5" />
        {mutation.isPending ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
