'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  Settings2,
  ArrowLeftRight,
  CalendarOff,
  Loader2,
  Sun,
  Stethoscope,
  UserCircle,
  Heart,
  Baby,
  Plane,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import type { PyraLeaveType } from '@/types/database';

const ICON_OPTIONS = [
  { value: 'CalendarOff', label: 'تقويم' },
  { value: 'Sun', label: 'شمس' },
  { value: 'Stethoscope', label: 'طب' },
  { value: 'UserCircle', label: 'شخصي' },
  { value: 'Baby', label: 'أمومة' },
  { value: 'Heart', label: 'قلب' },
  { value: 'Plane', label: 'سفر' },
  { value: 'GraduationCap', label: 'دراسة' },
  { value: 'Briefcase', label: 'عمل' },
];

const COLOR_OPTIONS = [
  { value: 'orange', label: 'برتقالي' },
  { value: 'blue', label: 'أزرق' },
  { value: 'purple', label: 'بنفسجي' },
  { value: 'green', label: 'أخضر' },
  { value: 'red', label: 'أحمر' },
  { value: 'yellow', label: 'أصفر' },
  { value: 'pink', label: 'وردي' },
  { value: 'cyan', label: 'سماوي' },
];

// Static color mapping — Tailwind cannot resolve dynamic class names at build time
const colorMap: Record<string, { bg: string; text: string; dot: string }> = {
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-500', dot: 'bg-orange-500' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', dot: 'bg-blue-500' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-500', dot: 'bg-purple-500' },
  green: { bg: 'bg-green-500/10', text: 'text-green-500', dot: 'bg-green-500' },
  red: { bg: 'bg-red-500/10', text: 'text-red-500', dot: 'bg-red-500' },
  yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
  pink: { bg: 'bg-pink-500/10', text: 'text-pink-500', dot: 'bg-pink-500' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-500', dot: 'bg-cyan-500' },
  gray: { bg: 'bg-gray-500/10', text: 'text-gray-500', dot: 'bg-gray-500' },
};

// Icon mapping — resolves stored icon name to actual component
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Sun,
  Stethoscope,
  UserCircle,
  CalendarOff,
  Heart,
  Baby,
  Plane,
  Briefcase,
  GraduationCap,
};

interface LeaveTypeForm {
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  default_days: number;
  max_carry_over: number;
  requires_attachment: boolean;
  is_paid: boolean;
  sort_order: number;
}

const EMPTY_FORM: LeaveTypeForm = {
  name: '',
  name_ar: '',
  icon: 'CalendarOff',
  color: 'orange',
  default_days: 0,
  max_carry_over: 0,
  requires_attachment: false,
  is_paid: true,
  sort_order: 0,
};

export default function LeaveSettingsClient() {
  const [leaveTypes, setLeaveTypes] = useState<PyraLeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LeaveTypeForm>(EMPTY_FORM);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Carry-over dialog
  const [showCarryOver, setShowCarryOver] = useState(false);
  const [carryFromYear, setCarryFromYear] = useState(new Date().getFullYear() - 1);
  const [carryToYear, setCarryToYear] = useState(new Date().getFullYear());
  const [carryingOver, setCarryingOver] = useState(false);

  const fetchLeaveTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/leave-types');
      if (res.ok) {
        const { data } = await res.json();
        setLeaveTypes(data || []);
      }
    } catch {
      // Silently handle network errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sort_order: leaveTypes.length });
    setShowDialog(true);
  };

  const openEdit = (lt: PyraLeaveType) => {
    setEditingId(lt.id);
    setForm({
      name: lt.name,
      name_ar: lt.name_ar,
      icon: lt.icon,
      color: lt.color,
      default_days: lt.default_days,
      max_carry_over: lt.max_carry_over,
      requires_attachment: lt.requires_attachment,
      is_paid: lt.is_paid,
      sort_order: lt.sort_order,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.name_ar || form.default_days <= 0) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setSaving(true);
    try {
      const url = editingId
        ? `/api/dashboard/leave-types/${editingId}`
        : '/api/dashboard/leave-types';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'فشل الحفظ');
      }

      toast.success(editingId ? 'تم تحديث نوع الإجازة' : 'تم إنشاء نوع الإجازة');
      setShowDialog(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchLeaveTypes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل الحفظ';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/dashboard/leave-types/${deleteId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'فشل الحذف');
      }
      toast.success('تم حذف نوع الإجازة');
      setDeleteId(null);
      fetchLeaveTypes();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل الحذف';
      toast.error(message);
    }
  };

  const handleCarryOver = async () => {
    setCarryingOver(true);
    try {
      const res = await fetch('/api/dashboard/leave/carry-over', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_year: carryFromYear, to_year: carryToYear }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'فشل الترحيل');
      }

      const { data } = await res.json();
      toast.success(
        `تم ترحيل الأرصدة: ${data.created} جديد، ${data.updated} محدث (${data.total_processed} إجمالي)`
      );
      setShowCarryOver(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'فشل الترحيل';
      toast.error(message);
    } finally {
      setCarryingOver(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-56" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إعدادات الإجازات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة أنواع الإجازات وترحيل الأرصدة
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Carry-Over Button */}
          <Dialog open={showCarryOver} onOpenChange={setShowCarryOver}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowLeftRight className="h-4 w-4 me-2" />
                ترحيل الأرصدة
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ترحيل أرصدة الإجازات</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <p className="text-sm text-muted-foreground">
                  سيتم ترحيل الأيام المتبقية من أنواع الإجازات التي تسمح بالترحيل (حسب الحد الأقصى
                  المحدد لكل نوع).
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">من سنة</label>
                    <Select
                      value={String(carryFromYear)}
                      onValueChange={(v) => setCarryFromYear(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">إلى سنة</label>
                    <Select
                      value={String(carryToYear)}
                      onValueChange={(v) => setCarryToYear(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>
                            {y}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleCarryOver}
                  disabled={carryingOver || carryToYear <= carryFromYear}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {carryingOver ? (
                    <>
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      جاري الترحيل...
                    </>
                  ) : (
                    'تنفيذ الترحيل'
                  )}
                </Button>
                {carryToYear <= carryFromYear && (
                  <p className="text-xs text-red-500">
                    سنة الهدف يجب أن تكون بعد سنة المصدر
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Leave Type Button */}
          <Button
            onClick={openCreate}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="h-4 w-4 me-2" />
            إضافة نوع
          </Button>
        </div>
      </div>

      {/* Leave Types List */}
      {leaveTypes.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="لا توجد أنواع إجازات"
          description="أضف أنواع الإجازات لبدء إدارة أرصدة الموظفين"
          actionLabel="إضافة نوع إجازة"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">أنواع الإجازات ({leaveTypes.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {leaveTypes.map((lt) => {
                const LeaveIcon = iconMap[lt.icon] || CalendarOff;
                return (
                <div
                  key={lt.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-10 w-10 rounded-lg ${colorMap[lt.color]?.bg || 'bg-gray-500/10'} flex items-center justify-center`}
                    >
                      <LeaveIcon className={`h-5 w-5 ${colorMap[lt.color]?.text || 'text-gray-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{lt.name_ar}</p>
                        <span className="text-xs text-muted-foreground">({lt.name})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {lt.default_days} يوم
                        </Badge>
                        {lt.max_carry_over > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            ترحيل: {lt.max_carry_over} يوم
                          </Badge>
                        )}
                        {lt.requires_attachment && (
                          <Badge variant="outline" className="text-[10px]">
                            يتطلب مرفق
                          </Badge>
                        )}
                        <Badge
                          className={`text-[10px] ${
                            lt.is_paid
                              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400'
                          }`}
                        >
                          {lt.is_paid ? 'مدفوعة' : 'غير مدفوعة'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => openEdit(lt)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                      onClick={() => setDeleteId(lt.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'تعديل نوع الإجازة' : 'إضافة نوع إجازة جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (إنجليزي) *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Annual Leave"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم (عربي) *</label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  placeholder="إجازة سنوية"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الأيقونة</label>
                <Select
                  value={form.icon}
                  onValueChange={(v) => setForm({ ...form, icon: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">اللون</label>
                <Select
                  value={form.color}
                  onValueChange={(v) => setForm({ ...form, color: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${colorMap[opt.value]?.dot || 'bg-gray-500'}`} />
                          {opt.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الأيام الافتراضية *</label>
                <Input
                  type="number"
                  min={0}
                  value={form.default_days}
                  onChange={(e) =>
                    setForm({ ...form, default_days: Number(e.target.value) })
                  }
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">حد الترحيل (أيام)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_carry_over}
                  onChange={(e) =>
                    setForm({ ...form, max_carry_over: Number(e.target.value) })
                  }
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">الترتيب</label>
              <Input
                type="number"
                min={0}
                value={form.sort_order}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
                dir="ltr"
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <label className="text-sm font-medium">يتطلب مرفق</label>
              <Switch
                checked={form.requires_attachment}
                onCheckedChange={(v) => setForm({ ...form, requires_attachment: v })}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <label className="text-sm font-medium">إجازة مدفوعة</label>
              <Switch
                checked={form.is_paid}
                onCheckedChange={(v) => setForm({ ...form, is_paid: v })}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !form.name || !form.name_ar || form.default_days <= 0}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من حذف نوع الإجازة؟ سيتم إلغاء تفعيله ولن يظهر في النظام.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteId(null)}>
                إلغاء
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 me-2" />
                حذف
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
