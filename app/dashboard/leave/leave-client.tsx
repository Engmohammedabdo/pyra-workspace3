'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { hasPermission } from '@/lib/auth/rbac';
import {
  CalendarOff, Plus, CheckCircle, XCircle, Sun, Stethoscope, UserCircle, Trash2, Ban, AlertTriangle
} from 'lucide-react';
import type { AuthSession } from '@/lib/auth/guards';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils/format';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = { annual: Sun, sick: Stethoscope, personal: UserCircle };

interface LeaveRequest {
  id: string;
  username: string;
  type: string;
  start_date: string;
  end_date: string;
  days_count: number;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
}

// Dynamic balance entry from v2 API
interface DynamicBalance {
  leave_type_id: string;
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  default_days: number;
  max_carry_over: number;
  requires_attachment: boolean;
  is_paid: boolean;
  total_days: number;
  used_days: number;
  carried_over: number;
  remaining: number;
}

interface LeaveBalanceResponse {
  version?: string;
  balances?: DynamicBalance[];
  // Legacy fields
  annual_total: number;
  annual_used: number;
  sick_total: number;
  sick_used: number;
  personal_total: number;
  personal_used: number;
}

interface ConflictEntry {
  username: string;
  display_name: string;
  start_date: string;
  end_date: string;
  leave_type: string;
}

interface LeaveClientProps { session: AuthSession; }

export default function LeaveClient({ session }: LeaveClientProps) {
  const t = useTranslations('hr.leave.list');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('leave');
  const typeLabelFor = useStatusLabels('leaveType');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balanceResponse, setBalanceResponse] = useState<LeaveBalanceResponse | null>(null);
  const [dynamicBalances, setDynamicBalances] = useState<DynamicBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formType, setFormType] = useState('annual');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formReason, setFormReason] = useState('');

  // Conflict detection state
  const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const canApprove = hasPermission(session.pyraUser.rolePermissions, 'leave.approve');
  const canManage = hasPermission(session.pyraUser.rolePermissions, 'leave.manage');

  const fetchData = useCallback(async () => {
    try {
      const [reqData, balData] = await Promise.all([
        fetchAPI<{ data: LeaveRequest[] }>('/api/leave'),
        fetchAPI<{ data: LeaveBalanceResponse }>('/api/leave/balance'),
      ]);
      const requests = (reqData as any).data ?? reqData;
      setRequests(requests || []);
      const bal = (balData as any).data ?? balData;
      if (bal) {
        setBalanceResponse(bal as LeaveBalanceResponse);
        if (bal.version === 'v2' && bal.balances) {
          setDynamicBalances(bal.balances);
          if (bal.balances.length > 0 && !formType) {
            setFormType(bal.balances[0].name);
          }
        }
      }
    } catch {
      // Silently handle network errors
    } finally { setLoading(false); }
  }, [formType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch conflicts when dates change in the create dialog
  useEffect(() => {
    if (!formStart || !formEnd || !showCreate) {
      setConflicts([]);
      return;
    }
    // Validate end >= start
    if (formEnd < formStart) {
      setConflicts([]);
      return;
    }

    setLoadingConflicts(true);

    fetchAPI<{ data: ConflictEntry[] }>(`/api/leave/conflicts?start_date=${formStart}&end_date=${formEnd}`)
      .then((data) => {
        setConflicts((data as any).data ?? data ?? []);
      })
      .catch(() => {
        // Aborted or network error
        setConflicts([]);
      })
      .finally(() => setLoadingConflicts(false));
  }, [formStart, formEnd, showCreate]);

  const submitRequest = async () => {
    if (!formStart || !formEnd) return;
    setSaving(true);
    try {
      await mutateAPI('/api/leave', 'POST', { type: formType, start_date: formStart, end_date: formEnd, reason: formReason });
      toast.success(t('toasts.submitSuccess'));
      setShowCreate(false);
      setFormStart(''); setFormEnd(''); setFormReason(''); setConflicts([]);
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toasts.submitFailed');
      toast.error(message);
    } finally { setSaving(false); }
  };

  const reviewRequest = async (id: string, status: string) => {
    try {
      await mutateAPI(`/api/leave/${id}`, 'PATCH', { status });
      toast.success(status === 'approved' ? t('toasts.reviewApproved') : t('toasts.reviewRejected'));
      fetchData();
    } catch { toast.error(t('toasts.reviewFailed')); }
  };

  // Legacy simple cancel for pending (delete) — still used by the trash icon
  const deletePendingRequest = async (id: string) => {
    try {
      await mutateAPI(`/api/leave/${id}`, 'PATCH', { status: 'cancelled' });
      toast.success(t('toasts.deleteSuccess'));
      fetchData();
    } catch { toast.error(t('toasts.deleteFailed')); }
  };

  // New cancel with reason (for approved + pending)
  const openCancelDialog = (id: string) => {
    setCancelTargetId(id);
    setCancelReason('');
    setCancelDialogOpen(true);
  };

  const submitCancellation = async () => {
    if (!cancelTargetId || !cancelReason.trim()) return;
    setCancelling(true);
    try {
      await mutateAPI(`/api/leave/${cancelTargetId}`, 'PATCH', { action: 'cancel', cancellation_reason: cancelReason.trim() });
      toast.success(t('toasts.cancelSuccess'));
      setCancelDialogOpen(false);
      setCancelTargetId(null);
      setCancelReason('');
      fetchData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('toasts.cancelFailed');
      toast.error(message);
    } finally { setCancelling(false); }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }

  // Build balance cards — dynamic if v2 is available, otherwise legacy
  const isV2 = dynamicBalances.length > 0;

  const balanceCards = isV2
    ? dynamicBalances.map((b) => ({
        type: b.name,
        label: b.name_ar,
        icon: TYPE_ICONS[b.name] || CalendarOff,
        total: b.total_days,
        used: b.used_days,
        carried_over: b.carried_over,
        color: b.color || 'orange',
      }))
    : [
        { type: 'annual', label: t('legacyBalanceLabels.annual'), icon: Sun, total: balanceResponse?.annual_total || 30, used: balanceResponse?.annual_used || 0, carried_over: 0, color: 'orange' },
        { type: 'sick', label: t('legacyBalanceLabels.sick'), icon: Stethoscope, total: balanceResponse?.sick_total || 15, used: balanceResponse?.sick_used || 0, carried_over: 0, color: 'blue' },
        { type: 'personal', label: t('legacyBalanceLabels.personal'), icon: UserCircle, total: balanceResponse?.personal_total || 5, used: balanceResponse?.personal_used || 0, carried_over: 0, color: 'purple' },
      ];

  // Build leave type options for the create dialog
  const leaveTypeOptions = isV2
    ? dynamicBalances.map((b) => ({ value: b.name, label: b.name_ar }))
    : [
        { value: 'annual', label: t('legacyTypeOptions.annual') },
        { value: 'sick', label: t('legacyTypeOptions.sick') },
        { value: 'personal', label: t('legacyTypeOptions.personal') },
      ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('requestCount', { count: requests.length })}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) { setConflicts([]); }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <Plus className="h-4 w-4 me-2" />
              {t('requestButton')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('createDialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('createDialog.typeLabel')}</label>
                <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {leaveTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('createDialog.startDateLabel')}</label>
                  <Input type="date" value={formStart} onChange={(e) => setFormStart(e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('createDialog.endDateLabel')}</label>
                  <Input type="date" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} dir="ltr" />
                </div>
              </div>

              {/* Conflict Warning */}
              {loadingConflicts && formStart && formEnd && (
                <div className="text-xs text-muted-foreground">{t('createDialog.checkingConflicts')}</div>
              )}
              {conflicts.length > 0 && (
                <div className="rounded-lg border border-yellow-400/50 bg-yellow-500/10 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <p className="text-sm font-medium">{t('createDialog.conflictWarning')}</p>
                  </div>
                  <ul className="space-y-1 ps-6">
                    {conflicts.map((c, idx) => (
                      <li key={idx} className="text-xs text-yellow-700 dark:text-yellow-300">
                        <span className="font-medium">{c.display_name}</span>
                        <span className="text-yellow-600/70 dark:text-yellow-400/70"> — {dynamicBalances.find((b) => b.name === c.leave_type)?.name_ar || typeLabelFor(c.leave_type)}</span>
                        <span className="text-yellow-600/60 dark:text-yellow-400/60 ms-1" dir="ltr">
                          ({formatDate(c.start_date, undefined, locale)} &rarr; {formatDate(c.end_date, undefined, locale)})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('createDialog.reasonLabel')}</label>
                <Input value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder={t('createDialog.reasonPlaceholder')} />
              </div>
              <Button onClick={submitRequest} disabled={saving || !formStart || !formEnd} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                {saving ? t('createDialog.submitting') : t('createDialog.submit')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Balance Cards */}
      <div className={`grid grid-cols-1 gap-4 ${balanceCards.length <= 3 ? 'sm:grid-cols-3' : balanceCards.length <= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3 lg:grid-cols-4'}`}>
        {balanceCards.map((b) => {
          const Icon = b.icon;
          const remaining = b.total - b.used;
          const pct = b.total > 0 ? (b.used / b.total) * 100 : 0;
          return (
            <Card key={b.type}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: b.color === 'orange' ? 'rgba(249,115,22,0.1)' : b.color === 'blue' ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)' }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: b.color === 'orange' ? '#f97316' : b.color === 'blue' ? '#3b82f6' : '#a855f7' }}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{b.label}</p>
                    <p className="text-xs text-muted-foreground">{t('balanceCard.remainingOf', { remaining, total: b.total })}</p>
                    {b.carried_over > 0 && (
                      <p className="text-[10px] text-orange-500">{t('balanceCard.carriedOver', { days: b.carried_over })}</p>
                    )}
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: b.color === 'orange' ? '#f97316' : b.color === 'blue' ? '#3b82f6' : '#a855f7',
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <EmptyState icon={CalendarOff} title={t('empty.title')} description={t('empty.description')} actionLabel={t('empty.actionLabel')} onAction={() => setShowCreate(true)} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {requests.map((req) => {
                const TypeIcon = TYPE_ICONS[req.type] || CalendarOff;
                const isCancelled = req.status === 'cancelled';
                const canCancelThis =
                  (req.status === 'approved' || req.status === 'pending') &&
                  (req.username === session.pyraUser.username || canApprove);

                // Resolve type label: dynamic first, then legacy fallback
                const dynamicType = dynamicBalances.find((b) => b.name === req.type);
                const typeLabel = dynamicType?.name_ar || typeLabelFor(req.type);

                return (
                  <div key={req.id} className={`flex items-center justify-between p-4 hover:bg-muted/50 transition-colors ${isCancelled ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <TypeIcon className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${isCancelled ? 'line-through' : ''}`}>
                            {typeLabel}
                          </p>
                          <span className={`text-xs text-muted-foreground ${isCancelled ? 'line-through' : ''}`}>
                            {t('daysCount', { count: req.days_count })}
                          </span>
                        </div>
                        <p className={`text-xs text-muted-foreground ${isCancelled ? 'line-through' : ''}`} dir="ltr">
                          {formatDate(req.start_date, undefined, locale)} &rarr; {formatDate(req.end_date, undefined, locale)}
                        </p>
                        {req.reason && <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>}
                        {isCancelled && req.cancellation_reason && (
                          <p className="text-xs text-destructive/80 mt-0.5">{t('cancellationReason', { reason: req.cancellation_reason })}</p>
                        )}
                        {canManage && req.username !== session.pyraUser.username && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{t('submittedBy', { username: req.username })}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getStatusBadgeClass(req.status)}`}>
                        {statusLabelFor(req.status)}
                      </Badge>
                      {/* Legacy delete for pending only (quick delete, no reason needed) */}
                      {req.status === 'pending' && req.username === session.pyraUser.username && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => deletePendingRequest(req.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {/* Cancel button (with reason dialog) for approved or pending */}
                      {canCancelThis && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-500 hover:text-red-600"
                          onClick={() => openCancelDialog(req.id)}
                        >
                          <Ban className="h-3 w-3 me-1" />
                          {t('cancelButton')}
                        </Button>
                      )}
                      {canApprove && req.status === 'pending' && (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 dark:text-green-400" onClick={() => reviewRequest(req.id, 'approved')}>
                            <CheckCircle className="h-3 w-3 me-1" />
                            {t('approveButton')}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500" onClick={() => reviewRequest(req.id, 'rejected')}>
                            <XCircle className="h-3 w-3 me-1" />
                            {t('rejectButton')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Reason Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) { setCancelTargetId(null); setCancelReason(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              {t('cancelDialog.helperText')}
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('cancelDialog.reasonLabel')} <span className="text-red-500">*</span></label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('cancelDialog.reasonPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelling}>
              {t('cancelDialog.back')}
            </Button>
            <Button
              variant="destructive"
              onClick={submitCancellation}
              disabled={cancelling || !cancelReason.trim()}
            >
              {cancelling ? t('cancelDialog.confirming') : t('cancelDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
