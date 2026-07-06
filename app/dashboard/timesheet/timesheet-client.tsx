// TODO: Add pagination for large timesheet datasets
'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
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
  Timer, CalendarRange, DollarSign, AlertTriangle, Loader2,
} from 'lucide-react';
import { dubaiDayKey } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { dirFor, type Locale } from '@/lib/i18n/config';
import type { AuthSession } from '@/lib/auth/guards';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

const PERIOD_STATUS_STYLES: Record<string, string> = {
  open: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  submitted: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
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
  const t = useTranslations('hr.timesheet.page');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('timesheet');
  const periodStatusLabelFor = useStatusLabels('timesheetPeriod');
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects();
  const [showAdd, setShowAdd] = useState(false);
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [periodStartDate, setPeriodStartDate] = useState('');
  const [periodEndDate, setPeriodEndDate] = useState('');

  const [formDate, setFormDate] = useState(dubaiDayKey());
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
      toast.success(t('toasts.entryAdded'));
      setShowAdd(false);
      setFormHours('');
      setFormDesc('');
      setFormProject('');
      setFormBillable(false);
      setFormBillingRate('');
      invalidateEntries();
      invalidateOvertime();
    },
    onError: () => toast.error(t('toasts.entryAddFailed')),
  });

  const submitEntryMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/timesheet/${id}`, 'PATCH', { status: 'submitted' }),
    onSuccess: () => { toast.success(t('toasts.entrySubmitted')); invalidateEntries(); },
    onError: () => toast.error(t('toasts.entrySubmitFailed')),
  });

  const approveEntryMutation = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      mutateAPI(`/api/timesheet/${id}`, 'PATCH', { status: approved ? 'approved' : 'rejected' }),
    onSuccess: (_, { approved }) => {
      toast.success(approved ? t('toasts.entryApproved') : t('toasts.entryRejected'));
      invalidateEntries();
    },
    onError: () => toast.error(t('toasts.entryActionFailed')),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => mutateAPI(`/api/timesheet/${id}`, 'DELETE'),
    onSuccess: () => { toast.success(t('toasts.entryDeleted')); invalidateEntries(); invalidateOvertime(); },
    onError: () => toast.error(t('toasts.entryDeleteFailed')),
  });

  // Period mutations
  const addPeriodMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/dashboard/timesheet-periods', 'POST', data),
    onSuccess: () => {
      toast.success(t('toasts.periodCreated'));
      setShowAddPeriod(false);
      setPeriodStartDate('');
      setPeriodEndDate('');
      invalidatePeriods();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toasts.periodCreateFailed')),
  });

  const updatePeriodStatusMutation = useMutation({
    mutationFn: ({ periodId, action }: { periodId: string; action: string }) =>
      mutateAPI(`/api/dashboard/timesheet-periods/${periodId}`, 'PATCH', { action }),
    onSuccess: (_, { action }) => {
      const actionLabels: Record<string, string> = {
        submit: t('toasts.periodActionLabels.submit'),
        approve: t('toasts.periodActionLabels.approve'),
        reject: t('toasts.periodActionLabels.reject'),
      };
      toast.success(actionLabels[action]);
      invalidatePeriods();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('toasts.periodActionFailed')),
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
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('summaryLine', { count: entries.length, hours: totalHours.toFixed(1) })}
          </p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4 me-2" />
              {t('logHours')}
            </Button>
          </DialogTrigger>
          <DialogContent dir={dirFor(locale)}>
            <DialogHeader>
              <DialogTitle>{t('addEntryDialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('addEntryDialog.dateLabel')}</label>
                  <Input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('addEntryDialog.hoursLabel')}</label>
                  <Input
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    placeholder={t('addEntryDialog.hoursPlaceholder')}
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('addEntryDialog.projectLabel')}</label>
                <select
                  value={formProject}
                  onChange={(e) => setFormProject(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t('addEntryDialog.noProject')}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('addEntryDialog.notesLabel')}</label>
                <Input
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('addEntryDialog.notesPlaceholder')}
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
                  {t('addEntryDialog.billable')}
                </label>
                {formBillable && (
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">{t('addEntryDialog.billingRateLabel')}</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formBillingRate}
                      onChange={(e) => setFormBillingRate(e.target.value)}
                      placeholder={t('addEntryDialog.billingRatePlaceholder')}
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
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('addEntryDialog.saving')}</> : t('addEntryDialog.save')}
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
              <p className="text-xs text-muted-foreground">{t('summaryCards.totalHours')}</p>
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
              <p className="text-xs text-muted-foreground">{t('summaryCards.approved')}</p>
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
              <p className="text-xs text-muted-foreground">{t('summaryCards.pendingApproval')}</p>
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
                {t('overtimeCard.title')}
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
                  <p className="text-[11px] text-muted-foreground">{t('overtimeCard.overtimeHours')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-lg font-bold">{overtimeSummary.total_overtime_entries}</p>
                  <p className="text-[11px] text-muted-foreground">{t('overtimeCard.overtimeEntries')}</p>
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
                  <p className="text-[11px] text-muted-foreground">{t('overtimeCard.estimatedPay')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Entries and Periods */}
      <Tabs defaultValue="entries" dir={dirFor(locale)}>
        <TabsList>
          <TabsTrigger value="entries">{t('tabs.entries')}</TabsTrigger>
          <TabsTrigger value="periods">{t('tabs.periods')}</TabsTrigger>
        </TabsList>

        {/* === ENTRIES TAB === */}
        <TabsContent value="entries">
          {entries.length === 0 ? (
            <EmptyState
              icon={Clock}
              title={t('entriesTab.empty.title')}
              description={t('entriesTab.empty.description')}
              actionLabel={t('entriesTab.empty.actionLabel')}
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
                            {new Date(entry.date).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', {
                              weekday: 'short',
                            })}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">
                              {entry.description || t('entriesTab.noDescription')}
                            </p>
                            {entry.is_billable && (
                              <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 text-[10px]">
                                {t('entriesTab.billable')}
                                {entry.billing_rate ? t('entriesTab.billableRate', { rate: entry.billing_rate }) : ''}
                              </Badge>
                            )}
                            {entry.is_overtime && (
                              <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px]">
                                {t('entriesTab.overtime')}
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
                          {statusLabelFor(entry.status)}
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
                              {t('entriesTab.submit')}
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
                              className="h-7 text-xs text-green-600 dark:text-green-400"
                              onClick={() => approveEntry(entry.id, true)}
                            >
                              <CheckCircle className="h-3 w-3 me-1" />
                              {t('entriesTab.approve')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-500"
                              onClick={() => approveEntry(entry.id, false)}
                            >
                              <XCircle className="h-3 w-3 me-1" />
                              {t('entriesTab.reject')}
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
                    {t('periodsTab.createPeriod')}
                  </Button>
                </DialogTrigger>
                <DialogContent dir={dirFor(locale)}>
                  <DialogHeader>
                    <DialogTitle>{t('periodsTab.createPeriodDialog.title')}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('periodsTab.createPeriodDialog.startDateLabel')}</label>
                        <Input
                          type="date"
                          value={periodStartDate}
                          onChange={(e) => setPeriodStartDate(e.target.value)}
                          dir="ltr"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">{t('periodsTab.createPeriodDialog.endDateLabel')}</label>
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
                      {periodSaving ? t('periodsTab.createPeriodDialog.creating') : t('periodsTab.createPeriodDialog.create')}
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
                title={t('periodsTab.empty.title')}
                description={t('periodsTab.empty.description')}
                actionLabel={t('periodsTab.empty.actionLabel')}
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
                                {periodStatusLabelFor(period.status)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {t('periodsTab.totalHours', { hours: period.total_hours.toFixed(1) })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t(`periodsTab.periodType.${period.period_type === 'weekly' ? 'weekly' : period.period_type === 'biweekly' ? 'biweekly' : 'monthly'}`)}
                              </span>
                              {period.rejection_note && (
                                <span className="text-xs text-red-500">
                                  {t('periodsTab.rejectionReason', { reason: period.rejection_note })}
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
                                {t('periodsTab.submit')}
                              </Button>
                            )}
                          {/* Approve/Reject buttons for managers */}
                          {canApprove && period.status === 'submitted' && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-green-600 dark:text-green-400"
                                onClick={() => updatePeriodStatus(period.id, 'approve')}
                              >
                                <CheckCircle className="h-3 w-3 me-1" />
                                {t('periodsTab.approve')}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-500"
                                onClick={() => updatePeriodStatus(period.id, 'reject')}
                              >
                                <XCircle className="h-3 w-3 me-1" />
                                {t('periodsTab.reject')}
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
