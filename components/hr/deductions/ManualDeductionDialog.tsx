'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useApproveManualDeduction } from '@/hooks/useDeductions';
import {
  MANUAL_DEDUCTION_BASIS,
  MONTHLY_DEDUCTION_CAP_PERCENT,
  QUALITY_DEDUCTION_APPROVAL_ENABLED,
  type ManualDeductionBasis,
} from '@/lib/constants/deductions';
import { CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';
import {
  isLegacyDeliveryDelayEvidenceForMonth,
  parseTrustedManualDeductionEvidence,
} from '@/lib/hr/manual-deduction';
import { isoToDubaiDateTime } from '@/lib/production/deadlines';
import { formatCurrency } from '@/lib/utils/format';
import { generateId } from '@/lib/utils/id';
import type { MonthlyEmployeeDeductionReport } from '@/lib/hr/deductions-report';

interface ManualDeductionDialogProps {
  employee: MonthlyEmployeeDeductionReport | null;
  month: string;
  currentMonth: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualDeductionDialog({
  employee,
  month,
  currentMonth,
  open,
  onOpenChange,
}: ManualDeductionDialogProps) {
  const t = useTranslations('hr.deductions.admin.manualDialog');
  const approve = useApproveManualDeduction();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [basis, setBasis] = useState<ManualDeductionBasis | ''>('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [ownerAttestation, setOwnerAttestation] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateId('md'));

  const usedCauses = useMemo(() => {
    const legacyTaskIds = new Set<string>();
    let qualityRecorded = false;
    for (const { manual } of employee?.manual_deductions ?? []) {
      const evidence = parseTrustedManualDeductionEvidence(manual.evidence);
      if (!evidence || evidence.report_month !== month) continue;
      if (evidence.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY) {
        for (const task of evidence.legacy_delivery.tasks) legacyTaskIds.add(task.task_id);
      } else {
        qualityRecorded = true;
      }
    }
    return { legacyTaskIds, qualityRecorded };
  }, [employee, month]);
  const eligibleLegacyTasks = useMemo(
    () => employee?.delivery_tasks.filter((task) =>
      isLegacyDeliveryDelayEvidenceForMonth(task, month)
      && !usedCauses.legacyTaskIds.has(task.task_id)) ?? [],
    [employee, month, usedCauses],
  );
  const qualityEvidenceEligible = employee?.candidate?.quality.eligible === true;
  const qualityEligible = QUALITY_DEDUCTION_APPROVAL_ENABLED
    && qualityEvidenceEligible
    && !usedCauses.qualityRecorded;

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setReason('');
    setBasis(eligibleLegacyTasks.length > 0
      ? MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
      : qualityEligible
        ? MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN
        : '');
    setSelectedTaskIds([]);
    setOwnerAttestation(false);
    setIdempotencyKey(generateId('md'));
  }, [open, employee?.username, month, eligibleLegacyTasks.length, qualityEligible]);

  const currency = employee?.currency ?? null;
  const remainingCap = employee?.cap_ledger?.remaining_amount ?? 0;
  const basisReady = basis === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN
    ? qualityEligible
    : basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
      ? selectedTaskIds.length > 0 && ownerAttestation
      : false;

  const handleApprove = () => {
    if (!employee || !currency) return;
    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      toast.error(t('validation.amount'));
      return;
    }
    if (requestedAmount > remainingCap) {
      toast.error(t('validation.overCap', {
        amount: formatCurrency(remainingCap, currency),
      }));
      return;
    }
    if (!reason.trim()) {
      toast.error(t('validation.reason'));
      return;
    }
    if (!basis) {
      toast.error(t('validation.basis'));
      return;
    }
    if (
      basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
      && selectedTaskIds.length === 0
    ) {
      toast.error(t('validation.tasks'));
      return;
    }
    if (
      basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
      && !ownerAttestation
    ) {
      toast.error(t('validation.attestation'));
      return;
    }
    if (
      basis === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN
      && !qualityEligible
    ) {
      toast.error(t('validation.quality'));
      return;
    }

    approve.mutate({
      idempotency_key: idempotencyKey,
      username: employee.username,
      period_month: `${month}-01`,
      amount: requestedAmount,
      reason: reason.trim(),
      basis,
      evidence_task_ids: basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
        ? [...selectedTaskIds].sort()
        : [],
      owner_attestation: basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
        && ownerAttestation,
    }, {
      onSuccess: () => {
        toast.success(t('success'));
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message || t('error')),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { name: employee?.display_name ?? '' })}</DialogTitle>
          <DialogDescription>{t('description', { month })}</DialogDescription>
        </DialogHeader>

        {employee && currency && month === currentMonth && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
              <p className="font-medium">{t('remainingCap')}</p>
              <p className="text-lg font-bold">{formatCurrency(remainingCap, currency)}</p>
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                {t('capNotice', { percent: MONTHLY_DEDUCTION_CAP_PERCENT })}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-deduction-basis">{t('basisLabel')}</Label>
              <Select
                value={basis}
                onValueChange={(value) => {
                  setBasis(value as ManualDeductionBasis);
                  setSelectedTaskIds([]);
                  setOwnerAttestation(false);
                }}
              >
                <SelectTrigger id="manual-deduction-basis">
                  <SelectValue placeholder={t('basisPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {eligibleLegacyTasks.length > 0 && (
                    <SelectItem value={MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY}>
                      {t('bases.legacyDelivery')}
                    </SelectItem>
                  )}
                  {qualityEligible && (
                    <SelectItem value={MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN}>
                      {t('bases.qualityPattern')}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY && (
              <div className="space-y-3 rounded-lg border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">{t('legacyTasksTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('legacyTasksDescription')}</p>
                </div>
                {eligibleLegacyTasks.map((task) => {
                  const checkboxId = `manual-deduction-task-${task.task_id}`;
                   const due = task.due_at && !task.deadline_unverified
                     ? isoToDubaiDateTime(task.due_at)
                     : null;
                   const dueLabel = due
                     ? `${due.date} ${due.time} (${CALENDAR_TIMEZONE_OFFSET})`
                     : task.due_date ?? t('timeUnavailable');
                   const submitted = task.first_submitted_at
                    ? isoToDubaiDateTime(task.first_submitted_at)
                    : null;
                  const submittedLabel = submitted
                    ? `${submitted.date} ${submitted.time} (${CALENDAR_TIMEZONE_OFFSET})`
                    : t('timeUnavailable');
                  return (
                    <div key={task.task_id} className="flex items-start gap-3 rounded-md border border-border/50 p-2">
                      <Checkbox
                        id={checkboxId}
                        className="mt-1"
                        checked={selectedTaskIds.includes(task.task_id)}
                        onCheckedChange={(checked) => {
                          setSelectedTaskIds((current) => checked === true
                            ? [...new Set([...current, task.task_id])]
                            : current.filter((taskId) => taskId !== task.task_id));
                        }}
                      />
                      <Label htmlFor={checkboxId} className="min-w-0 cursor-pointer space-y-1 font-normal">
                        <span className="block break-words text-sm font-medium">{task.title}</span>
                        <span className="block break-all text-xs text-muted-foreground">
                          {t('taskId', { id: task.task_id })}
                        </span>
                         <span className="block text-xs text-muted-foreground">
                           {due
                             ? t('legacyTaskDueAt', { value: dueLabel })
                             : t('legacyTaskDueDateOnly', { date: dueLabel })}
                         </span>
                         <span className="block text-xs text-muted-foreground">
                           {t('legacyTaskSubmittedAt', { value: submittedLabel })}
                         </span>
                         {task.attribution_status === 'legacy_unverified' && (
                           <span className="block text-xs text-amber-700 dark:text-amber-300">
                             {t('legacyTaskAttributionUnverified')}
                           </span>
                         )}
                      </Label>
                    </div>
                  );
                })}
                <div className="flex items-start gap-3 rounded-md bg-amber-50 p-2 dark:bg-amber-950/30">
                  <Checkbox
                    id="manual-deduction-owner-attestation"
                    className="mt-1"
                    checked={ownerAttestation}
                    onCheckedChange={(checked) => setOwnerAttestation(checked === true)}
                  />
                  <Label htmlFor="manual-deduction-owner-attestation" className="cursor-pointer text-xs font-normal">
                    {t('ownerAttestation')}
                  </Label>
                </div>
              </div>
            )}

            {basis === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN && (
              <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
                {t('qualityEvidence', {
                  count: employee.candidate?.quality.consecutive_months ?? 0,
                })}
              </p>
            )}

            {qualityEvidenceEligible && !QUALITY_DEDUCTION_APPROVAL_ENABLED && (
              <p className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
                {t('qualityTimingPending')}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="manual-deduction-amount">{t('amountLabel')}</Label>
              <Input
                id="manual-deduction-amount"
                type="number"
                min="0.01"
                max={remainingCap}
                step="0.01"
                dir="ltr"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-deduction-reason">{t('reasonLabel')}</Label>
              <Textarea
                id="manual-deduction-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('reasonPlaceholder')}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{t('evidenceNotice')}</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleApprove}
            disabled={
              approve.isPending
              || !employee
              || month !== currentMonth
              || remainingCap <= 0
              || !basisReady
            }
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            {approve.isPending ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="me-2 h-4 w-4" />
            )}
            {approve.isPending ? t('approving') : t('approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
