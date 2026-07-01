'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Clock, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import {
  useWorkSchedules,
  useCreateWorkSchedule,
  useUpdateWorkSchedule,
  useDeleteWorkSchedule,
} from '@/hooks/useWorkSchedules';
import type { PyraWorkSchedule } from '@/types/database';

// Day labels indexed by 0=Sunday..6=Saturday
const DAY_LABELS: Record<number, string> = {
  0: 'الأحد',
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Default for NEW schedules: Mon–Sat (company weekend = Sunday only)
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];

interface ScheduleForm {
  name: string;
  name_ar: string;
  work_days: number[];
  start_time: string;
  end_time: string;
  break_minutes: number;
  daily_hours: number;
  overtime_multiplier: number;
  weekend_multiplier: number;
  is_default: boolean;
}

const EMPTY_FORM: ScheduleForm = {
  name: '',
  name_ar: '',
  work_days: DEFAULT_WORK_DAYS,
  start_time: '09:00',
  end_time: '18:00',
  break_minutes: 60,
  daily_hours: 8,
  overtime_multiplier: 1.5,
  weekend_multiplier: 2.0,
  is_default: false,
};

export default function WorkSchedulesClient() {
  const { data: schedules = [], isLoading } = useWorkSchedules();
  const createMut = useCreateWorkSchedule();
  const updateMut = useUpdateWorkSchedule();
  const deleteMut = useDeleteWorkSchedule();

  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const saving = createMut.isPending || updateMut.isPending;
  const deleting = deleteMut.isPending;

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (s: PyraWorkSchedule) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      name_ar: s.name_ar,
      work_days: s.work_days,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      daily_hours: Number(s.daily_hours),
      overtime_multiplier: Number(s.overtime_multiplier),
      weekend_multiplier: Number(s.weekend_multiplier),
      is_default: s.is_default,
    });
    setShowDialog(true);
  };

  const toggleDay = (day: number) => {
    setForm((prev) => {
      const exists = prev.work_days.includes(day);
      const next = exists
        ? prev.work_days.filter((d) => d !== day)
        : [...prev.work_days, day].sort((a, b) => a - b);
      return { ...prev, work_days: next };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.name_ar.trim()) {
      toast.error('يرجى ملء الاسم بالعربي والإنجليزي');
      return;
    }
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, ...form });
        toast.success('تم تحديث جدول العمل');
      } else {
        await createMut.mutateAsync(form);
        toast.success('تم إنشاء جدول العمل');
      }
      setShowDialog(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل الحفظ';
      toast.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync(deleteId);
      toast.success('تم حذف جدول العمل');
      setDeleteId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل الحذف';
      toast.error(msg);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-orange-500" aria-hidden />
            جداول العمل
          </h1>
          <p className="text-sm text-muted-foreground">
            إدارة جداول العمل الأسبوعية وتعيينها للموظفين
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4 me-2" />
          إضافة جدول
        </Button>
      </div>

      {/* List */}
      {schedules.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="لا توجد جداول عمل"
          description="أضف جدول العمل الأول لتتمكن من تعيينه للموظفين"
          actionLabel="إضافة جدول عمل"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              جداول العمل ({schedules.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  {/* Info */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Clock className="h-4 w-4 text-orange-500" />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{s.name_ar}</p>
                        <span className="text-xs text-muted-foreground">({s.name})</span>
                        {s.is_default && (
                          <Badge className="text-[10px] bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700/60">
                            افتراضي
                          </Badge>
                        )}
                      </div>
                      {/* Time & hours */}
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {s.start_time} – {s.end_time}
                        {' · '}
                        {s.daily_hours} ساعات/يوم
                        {s.break_minutes > 0 && ` · استراحة ${s.break_minutes} دقيقة`}
                      </p>
                      {/* Work days chips */}
                      <div className="flex flex-wrap gap-1">
                        {ALL_DAYS.map((day) => {
                          const isWorking = s.work_days.includes(day);
                          return (
                            <span
                              key={day}
                              className={
                                isWorking
                                  ? 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                  : 'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground'
                              }
                            >
                              {DAY_LABELS[day]}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0 ms-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
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
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Standard Week"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (عربي) *</label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
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
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">وقت النهاية</label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
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
                  onChange={(e) =>
                    setForm({ ...form, break_minutes: Number(e.target.value) })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, daily_hours: Number(e.target.value) })
                  }
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
                  onChange={(e) =>
                    setForm({ ...form, overtime_multiplier: Number(e.target.value) })
                  }
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
                onChange={(e) =>
                  setForm({ ...form, weekend_multiplier: Number(e.target.value) })
                }
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
                onCheckedChange={(v) => setForm({ ...form, is_default: v })}
              />
            </div>

            <Button
              onClick={handleSave}
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا الجدول؟ لا يمكن التراجع عن هذه العملية.
              لا يمكن حذف جدول مُعيَّن لموظفين أو الجدول الافتراضي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 me-2" />
              )}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
