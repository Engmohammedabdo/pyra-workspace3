'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { ALL_DAYS, DAY_KEY_BY_INDEX, type ScheduleForm } from './schedule-form';

interface WorkScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: ScheduleForm;
  setForm: Dispatch<SetStateAction<ScheduleForm>>;
  onSave: () => void;
  saving: boolean;
}

export function WorkScheduleDialog({
  open,
  onOpenChange,
  editingId,
  form,
  setForm,
  onSave,
  saving,
}: WorkScheduleDialogProps) {
  const t = useTranslations('hr.workSchedules');

  const toggleDay = (day: number) => {
    setForm((prev) => {
      const exists = prev.work_days.includes(day);
      const next = exists
        ? prev.work_days.filter((d) => d !== day)
        : [...prev.work_days, day].sort((a, b) => a - b);
      return { ...prev, work_days: next };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingId ? t('dialog.editTitle') : t('dialog.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {/* Name fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.nameEnLabel')}</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Standard Week"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.nameArLabel')}</label>
              <Input
                value={form.name_ar}
                onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))}
                placeholder="الأسبوع العادي" // i18n-exempt: Arabic example placeholder for name_ar data field
              />
            </div>
          </div>

          {/* Work days */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('dialog.workDaysLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => {
                const active = form.work_days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      active
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-background text-muted-foreground border-border hover:border-orange-400 hover:text-orange-600 dark:hover:text-orange-400'
                    }`}
                  >
                    {t(`dayNamesFull.${DAY_KEY_BY_INDEX[day]}`)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.startTimeLabel')}</label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.endTimeLabel')}</label>
              <Input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                dir="ltr"
              />
            </div>
          </div>

          {/* Numeric fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.breakMinutesLabel')}</label>
              <Input
                type="number"
                min={0}
                value={form.break_minutes}
                onChange={(e) => setForm((p) => ({ ...p, break_minutes: Number(e.target.value) }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.dailyHoursLabel')}</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={form.daily_hours}
                onChange={(e) => setForm((p) => ({ ...p, daily_hours: Number(e.target.value) }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('dialog.overtimeMultiplierLabel')}</label>
              <Input
                type="number"
                min={1}
                step={0.1}
                value={form.overtime_multiplier}
                onChange={(e) => setForm((p) => ({ ...p, overtime_multiplier: Number(e.target.value) }))}
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('dialog.weekendMultiplierLabel')}</label>
            <Input
              type="number"
              min={1}
              step={0.1}
              value={form.weekend_multiplier}
              onChange={(e) => setForm((p) => ({ ...p, weekend_multiplier: Number(e.target.value) }))}
              dir="ltr"
              className="max-w-[180px]"
            />
          </div>

          {/* Default toggle */}
          <div className="flex items-center justify-between py-2 border rounded-lg px-3 bg-muted/30 dark:bg-muted/20">
            <div>
              <p className="text-sm font-medium">{t('dialog.defaultToggleLabel')}</p>
              <p className="text-xs text-muted-foreground">
                {t('dialog.defaultToggleHint')}
              </p>
            </div>
            <Switch
              checked={form.is_default}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_default: v }))}
            />
          </div>

          <Button
            onClick={onSave}
            disabled={saving || !form.name.trim() || !form.name_ar.trim()}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t('dialog.saving')}
              </>
            ) : editingId ? (
              t('dialog.update')
            ) : (
              t('dialog.create')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
