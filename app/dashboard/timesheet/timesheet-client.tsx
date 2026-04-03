// TODO: Add pagination for large timesheet datasets
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useProjects } from '@/hooks/useProjects';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import {
  Clock, Plus, Send, CheckCircle, XCircle, Trash2, Briefcase,
  Timer, CalendarRange, DollarSign, AlertTriangle,
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  submitted: 'مرسل',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

const PERIOD_STATUS_STYLES: Record<string, string> = {
  open: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const PERIOD_STATUS_LABELS: Record<string, string> = {
  open: 'مفتوحة',
  submitted: 'مرسلة',
  approved: 'معتمدة',
  rejected: 'مرفوضة',
};

interface TimesheetEntry {
  id: string;
  username: string;
  project_id: string | null;
  task_id: string | null;
  date: string;
  hours: number;
  description: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  is_overtime?: boolean;
  overtime_multiplier?: number;
  is_billable?: boolean;
  billing_rate?: number | null;
  period_id?: string | null;
  pyra_projects: { id: string; name: string } | null;
}

interface TimesheetPeriod {
  id: string;
  username: string;
  period_type: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_note: string | null;
  created_at: string;
}

interface OvertimeSummary {
  total_overtime_hours: number;
  total_overtime_entries: number;
  estimated_pay: number;
  hourly_rate: number;
}

interface TimesheetClientProps {
  session: AuthSession;
}

export default function TimesheetClient({ session }: TimesheetClientProps) {
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const [showAdd, setShowAdd] = useState(false);
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');

  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formHours, setFormHours] = useState('');
  const [formProject, setFormProject] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formBillable, setFormBillable] = useState(false);
  const [formBillingRate, setFormBillingRate] = useState('');

  const canManage = hasPermission(session.pyraUser.rolePermissions, 'timesheet.manage');
  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'timesheet.approve');

  const { data: entries = [], isLoading: loading } = useQuery<TimesheetEntry[]>({
    queryKey: ['timesheet'],
    queryFn: () => fetchAPI('/api/timesheet'),
  });

  const { data: periods = [], isLoading: periodsLoading } = useQuery<TimesheetPeriod[]>({
    queryKey: ['timesheet-periods', session.pyraUser.username],
    queryFn: () => fetchAPI(`/api/dashboard/timesheet-periods?username=${session.pyraUser.username}`),
  });

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data: overtimeSummary } = useQuery<OvertimeSummary | null>({
    queryKey: ['overtime-summary', session.pyraUser.username, month],
    queryFn: () => fetchAPI(`/api/dashboard/overtime/summary?username=${session.pyraUser.username}&month=${month}`),
  });

  const invalidateEntries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['timesheet'] });
  }, [queryClient]);

  const invalidatePeriods = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['timesheet-periods'] });
  }, [queryClient]);

  const invalidateOvertime = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['overtime-summary'] });
  }, [queryClient]);

  // Entry mutations
  const addEntryMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/timesheet', 'POST', data),
    onSuccess: () => {
      toast.success('تم إضافة السجل');
      setShowAdd(false);
      setFormHours('');
      setFormDesc('');
      setFormProject('');
      setFormBillable(false);
      setFormBillingRate('');
      invalidateEntries();
      invalidateOvertime();
    },
    onError: () => toast.error('فشل الإضافة'),
  });

  const submitEntryMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/timesheet/${id}`, 'PATCH', { status: 'submitted' }),
    onSuccess: () => { toast.success('تم إرسال السجل للاعتماد'); invalidateEntries(); },
    onError: () => toast.error('فشل الإرسال'),
  });

  const approveEntryMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      mutateAPI(`/api/timesheet/${id}`, 'PATCH', { status: approved ? 'approved' : 'rejected' }),
    onSuccess: (_, { approved }) => {
      toast.success(approved ? 'تم اعتماد السجل' : 'تم رفض السجل');
      invalidateEntries();
    },
    onError: () => toast.error('فشل العملية'),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/timesheet/${id}`, 'DELETE'),
    onSuccess: () => { toast.success('تم الحذف'); invalidateEntries(); invalidateOvertime(); },
    onError: () => toast.error('فشل الحذف'),
  });

  // Period mutations
  const addPeriodMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/dashboard/timesheet-periods', 'POST', data),
    onSuccess: () => {
      toast.success('تم إنشاء الفترة');
      setShowAddPeriod(false);
      setPeriodStartDate('');
      setPeriodEndDate('');
      invalidatePeriods();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'فشل إنشاء الفترة'),
  });

  const updatePeriodStatusMutation = useMutation({
    mutationFn: ({ periodId, action }: { periodId: string; action: string }) =>
      mutateAPI(`/api/dashboard/timesheet-periods/${periodId}`, 'PATCH', { action }),
    onSuccess: (_, { action }) => {
      const actionLabels: Record<string, string> = {
        submit: 'تم إرسال الفترة',
        approve: 'تم اعتماد الفترة',
        reject: 'تم رفض الفترة',
      };
      toast.success(actionLabels[action]);
      invalidatePeriods();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'فشل العملية'),
  });

  const saving = addEntryMutation.isPending;
  const periodSaving = addPeriodMutation.isPending;

  const addEntry = () => {
    if (!formDate || !formHours) return;
    addEntryMutation.mutate({
      date: formDate,
      hours: parseFloat(formHours),
      project_id: formProject || null,
      description: formDesc || null,
      is_billable: formBillable,
      billing_rate: formBillingRate ? parseFloat(formBillingRate) : null,
    });
  };

  const submitEntry = (id: string) => submitEntryMutation.mutate(id);
  const approveEntry = (id: string, approved: boolean) => approveEntryMutation.mutate({ id, approved });
  const deleteEntry = (id: string) => deleteEntryMutation.mutate(id);

  const addPeriod = () => {
    if (!periodStartDate || !periodEndDate) return;
    addPeriodMutation.mutate({
      start_date: periodStartDate,
      end_date: periodEndDate,
      period_type: 'weekly',
    });
  };

  const updatePeriodStatus = (periodId: string, action: 'submit' | 'approve' | 'reject') => {
    updatePeriodStatusMutation.mutate({ periodId, action });
  };

  const totalHours = useMemo(
    () => entries.reduce((sum, e) => sum + (e.hours || 0), 0),
    [entries]
  );

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">سجل ساعات العمل</h1>
          <p className="text-sm text-muted-foreground">
            {entries.length} سجل &middot; إجمالي {totalHours.toFixed(1)} ساعة
          </p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4 me-2" />
              تسجيل ساعات
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تسجيل ساعات عمل</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">التاريخ</label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">الساعات</label>
                  <Input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    placeholder="مثال: 8"
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المشروع (اختياري)</label>
                <select
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">بدون مشروع</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">ملاحظات</label>
                <Input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="ما الذي عملت عليه؟"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formBillable}
                    onChange={(e) => setFormBillable(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  قابل للفوترة
                </label>
                {formBillable && (
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">سعر الساعة</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formBillingRate}
                      onChange={(e) => setFormBillingRate(e.target.value)}
                      placeholder="مثال: 150"
                      dir="ltr"
                      className="h-8"
                    />
                  </div>
                )}
              </div>
              <Button
                onClick={addEntry}
                disabled={saving || !formHours}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">إجمالي الساعات</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {entries.filter((e) => e.status === 'approved').length}
              </p>
              <p className="text-xs text-muted-foreground">معتمد</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Send className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {entries.filter((e) => e.status === 'submitted').length}
              </p>
              <p className="text-xs text-muted-foreground">بانتظار الاعتماد</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Overtime Summary Card — only show if there are overtime entries */}
      {overtimeSummary && overtimeSummary.total_overtime_entries > 0 && (
        <Card className="border-orange-500/20 bg-orange-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Timer className="h-5 w-5 text-orange-500" />
              <h3 className="font-semibold text-orange-600 dark:text-orange-400">
                ملخص العمل الإضافي — الشهر الحالي
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-lg font-bold" dir="ltr">
                    {overtimeSummary.total_overtime_hours}h
                  </p>
                  <p className="text-[11px] text-muted-foreground">ساعات إضافية</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{overtimeSummary.total_overtime_entries}</p>
                  <p className="text-[11px] text-muted-foreground">إدخال إضافي</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-lg font-bold" dir="ltr">
                    {overtimeSummary.estimated_pay.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">تقدير الأجر الإضافي</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Entries and Periods */}
      <Tabs defaultValue="entries" dir="rtl">
        <TabsList>
          <TabsTrigger value="entries">الإدخالات</TabsTrigger>
          <TabsTrigger value="periods">الفترات</TabsTrigger>
        </TabsList>

        {/* === ENTRIES TAB === */}
        <TabsContent value="entries">
          {entries.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="لا توجد سجلات"
              description="ابدأ بتسجيل ساعات عملك"
              actionLabel="تسجيل ساعات"
              onAction={() => setShowAdd(true)}
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-lg font-bold" dir="ltr">
                            {entry.hours}h
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(entry.date).toLocaleDateString('ar-EG', {
                              weekday: 'short',
                            })}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              {entry.description || 'بدون وصف'}
                            </p>
                            {entry.is_billable && (
                              <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 text-[10px]">
                                قابل للفوترة
                                {entry.billing_rate ? ` (${entry.billing_rate}/س)` : ''}
                              </Badge>
                            )}
                            {entry.is_overtime && (
                              <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px]">
                                عمل إضافي
                              </Badge>
                            )}
                            {entry.is_overtime && entry.overtime_multiplier && (
                              <span className="text-[10px] text-orange-500 font-medium" dir="ltr">
                                x{entry.overtime_multiplier}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className="text-xs text-muted-foreground"
                              dir="ltr"
                            >
                              {entry.date}
                            </span>
                            {entry.pyra_projects && (
                              <Badge variant="secondary" className="text-[10px]">
                                <Briefcase className="h-3 w-3 me-1" />
                                {entry.pyra_projects.name}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={`text-[10px] ${STATUS_STYLES[entry.status]}`}>
                          {STATUS_LABELS[entry.status]}
                        </Badge>
                        {entry.status === 'draft' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => submitEntry(entry.id)}
                            >
                              <Send className="h-3 w-3 me-1" />
                              إرسال
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500"
                              onClick={() => deleteEntry(entry.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {canApprove && entry.status === 'submitted' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-green-600"
                              onClick={() => approveEntry(entry.id, true)}
                            >
                              <CheckCircle className="h-3 w-3 me-1" />
                              اعتماد
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-500"
                              onClick={() => approveEntry(entry.id, false)}
                            >
                              <XCircle className="h-3 w-3 me-1" />
                              رفض
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* === PERIODS TAB === */}
        <TabsContent value="periods">
          <div className="space-y-4">
            {/* Add Period Button */}
            <div className="flex justify-end">
              <Dialog open={showAddPeriod} onOpenChange={setShowAddPeriod}>
                <DialogTrigger asChild>
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white">
                    <Plus className="h-4 w-4 me-2" />
                    إنشاء فترة
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>إنشاء فترة زمنية</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">تاريخ البداية</label>
                        <Input
                          type="date"
                          value={periodStartDate}
                          onChange={(e) => setPeriodStartDate(e.target.value)}
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">تاريخ النهاية</label>
                        <Input
                          type="date"
                          value={periodEndDate}
                          onChange={(e) => setPeriodEndDate(e.target.value)}
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={addPeriod}
                      disabled={periodSaving || !periodStartDate || !periodEndDate}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      {periodSaving ? 'جاري الإنشاء...' : 'إنشاء'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Periods List */}
            {periodsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : periods.length === 0 ? (
              <EmptyState
                icon={CalendarRange}
                title="لا توجد فترات"
                description="أنشئ فترة زمنية لتجميع سجلات الساعات"
                actionLabel="إنشاء فترة"
                onAction={() => setShowAddPeriod(true)}
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {periods.map((period) => (
                      <div
                        key={period.id}
                        className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                            <CalendarRange className="h-5 w-5 text-blue-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium" dir="ltr">
                                {period.start_date} — {period.end_date}
                              </p>
                              <Badge className={`text-[10px] ${PERIOD_STATUS_STYLES[period.status]}`}>
                                {PERIOD_STATUS_LABELS[period.status]}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {period.total_hours.toFixed(1)} ساعة
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {period.period_type === 'weekly' ? 'أسبوعية' : period.period_type === 'biweekly' ? 'نصف شهرية' : 'شهرية'}
                              </span>
                              {period.rejection_note && (
                                <span className="text-xs text-red-500">
                                  سبب الرفض: {period.rejection_note}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Submit button for owner — open or rejected periods */}
                          {(period.status === 'open' || period.status === 'rejected') &&
                            period.username === session.pyraUser.username && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => updatePeriodStatus(period.id, 'submit')}
                              >
                                <Send className="h-3 w-3 me-1" />
                                إرسال
                              </Button>
                            )}
                          {/* Approve/Reject buttons for managers */}
                          {canApprove && period.status === 'submitted' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-green-600"
                                onClick={() => updatePeriodStatus(period.id, 'approve')}
                              >
                                <CheckCircle className="h-3 w-3 me-1" />
                                اعتماد
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-500"
                                onClick={() => updatePeriodStatus(period.id, 'reject')}
                              >
                                <XCircle className="h-3 w-3 me-1" />
                                رفض
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
