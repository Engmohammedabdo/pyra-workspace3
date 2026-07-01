'use client';

import type { Dispatch, SetStateAction } from 'react';
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
import { DAY_LABELS, ALL_DAYS, type ScheduleForm } from './schedule-form';

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
            {editingId ? 'تعديل جدول العمل' : 'إضافة جدول عمل جديد'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          {/* Name fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">الاسم (إنجليزي) *</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Standard Week"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الاسم (عربي) *</label>
              <Input
                value={form.name_ar}
                onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))}
                placeholder="الأسبوع العادي"
              />
            </div>
          </div>

          {/* Work days */}
          <div className="space-y-2">
            <label className="text-sm font-medium">أيام العمل</label>
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
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">وقت البداية</label>
              <Input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">وقت النهاية</label>
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
              <label className="text-sm font-medium">الاستراحة (دقيقة)</label>
              <Input
                type="number"
                min={0}
                value={form.break_minutes}
                onChange={(e) => setForm((p) => ({ ...p, break_minutes: Number(e.target.value) }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ساعات اليوم</label>
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
              <label className="text-sm font-medium">معامل الإضافي</label>
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
            <label className="text-sm font-medium">معامل عمل نهاية الأسبوع</label>
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
              <p className="text-sm font-medium">جدول افتراضي</p>
              <p className="text-xs text-muted-foreground">
                يُطبَّق على الموظفين الذين لم يُعيَّن لهم جدول محدد
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
                جاري الحفظ...
              </>
            ) : editingId ? (
              'تحديث'
            ) : (
              'إنشاء'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
