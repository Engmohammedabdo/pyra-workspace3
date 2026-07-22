'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Banknote, CalendarCheck, CheckCircle2, ShieldAlert, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DeductionRiskEvidence } from '@/components/hr/deductions/DeductionRiskEvidence';
import { ManualDeductionEvidenceSnapshot } from '@/components/hr/deductions/ManualDeductionEvidenceSnapshot';
import {
  MANUAL_DEDUCTION_BASIS,
  MONTHLY_DEDUCTION_CAP_PERCENT,
  QUALITY_DEDUCTION_APPROVAL_ENABLED,
} from '@/lib/constants/deductions';
import { formatCurrency } from '@/lib/utils/format';
import type {
  DeductionIntegrityBlocker,
  MonthlyEmployeeDeductionReport,
} from '@/lib/hr/deductions-report';
import { isManualDeductionLedgerBlocker } from '@/lib/hr/deductions-report';
import {
  isLegacyDeliveryDelayEvidenceForMonth,
  parseTrustedManualDeductionEvidence,
} from '@/lib/hr/manual-deduction';
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';

function integrityKey(code: DeductionIntegrityBlocker['code']) {
  switch (code) {
    case 'invalid_salary': return 'invalidSalary' as const;
    case 'invalid_salary_currency': return 'invalidSalaryCurrency' as const;
    case 'historical_salary_unverified': return 'historicalSalaryUnverified' as const;
    case 'inactive_employee': return 'inactiveEmployee' as const;
    case 'attendance_tracking_unverified': return 'attendanceTrackingUnverified' as const;
    case 'missing_productivity_evidence': return 'missingProductivityEvidence' as const;
    case 'deduction_missing_effective_month': return 'missingEffectiveMonth' as const;
    case 'deduction_cap_exemption_invalid': return 'capExemptionInvalid' as const;
    case 'deduction_currency_mismatch': return 'currencyMismatch' as const;
    case 'deduction_case_payment_missing': return 'casePaymentMissing' as const;
    case 'deduction_case_payment_mismatch': return 'casePaymentMismatch' as const;
    case 'manual_deduction_payment_missing': return 'manualPaymentMissing' as const;
    case 'manual_deduction_payment_mismatch': return 'manualPaymentMismatch' as const;
    case 'candidate_calculation_failed': return 'calculationFailed' as const;
  }
}

export function AdminDeductionEmployeeCard({
  employee,
  month,
  currentMonth,
  onApproveComputed,
  computedApproving = false,
  onManualDeduction,
  onCancelDeduction,
  onAttendanceTracking,
}: {
  employee: MonthlyEmployeeDeductionReport;
  month: string;
  currentMonth: string;
  onApproveComputed: () => void;
  computedApproving?: boolean;
  onManualDeduction: () => void;
  onCancelDeduction?: (paymentId: string) => void;
  onAttendanceTracking?: () => void;
}) {
  const t = useTranslations('hr.deductions.admin.employee');
  const tIntegrity = useTranslations('hr.deductions.myRisk.integrity');
  const candidate = employee.candidate;
  const attendanceTrackingUnverified = employee.integrity_blockers.some(
    (blocker) => blocker.code === 'attendance_tracking_unverified',
  );
  const capLedger = employee.cap_ledger;
  const currency = employee.currency ?? candidate?.currency ?? null;
  const hasCaseLinkageBlocker = employee.integrity_blockers.some((blocker) =>
    blocker.code === 'deduction_case_payment_missing'
    || blocker.code === 'deduction_case_payment_mismatch',
  );
  const validExistingCase = employee.existing_case?.payment && !hasCaseLinkageBlocker
    ? {
        case: employee.existing_case.case,
        payment: employee.existing_case.payment,
      }
    : null;
  const activeExistingCase = validExistingCase?.payment.status !== EMPLOYEE_PAYMENT_STATUS.REJECTED
    ? validExistingCase
    : null;
  const cancelledExistingCase = validExistingCase?.payment.status === EMPLOYEE_PAYMENT_STATUS.REJECTED
    ? validExistingCase
    : null;
  const validManualDeductions = employee.manual_deductions.filter(({ manual, payment }) =>
    payment
    && !employee.integrity_blockers.some((blocker) =>
      (blocker.code === 'manual_deduction_payment_missing'
        || blocker.code === 'manual_deduction_payment_mismatch')
      && blocker.payment_id === manual.payment_id,
    ),
  );
  const unlinkedManualDeductions = employee.manual_deductions.filter(({ manual }) =>
    !validManualDeductions.some(({ manual: valid }) => valid.id === manual.id),
  );
  const activeManualDeductions = validManualDeductions.filter(
    ({ payment }) => payment?.status !== EMPLOYEE_PAYMENT_STATUS.REJECTED,
  );
  const cancelledManualDeductions = validManualDeductions.filter(
    ({ payment }) => payment?.status === EMPLOYEE_PAYMENT_STATUS.REJECTED,
  );
  const trustedManualEvidence = employee.manual_deductions
    .map(({ manual }) => parseTrustedManualDeductionEvidence(manual.evidence))
    .filter((evidence): evidence is NonNullable<ReturnType<
      typeof parseTrustedManualDeductionEvidence
    >> => evidence !== null && evidence.report_month === month);
  const usedLegacyTaskIds = new Set(trustedManualEvidence.flatMap((evidence) =>
    evidence.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY
      ? evidence.legacy_delivery.tasks.map((task) => task.task_id)
      : []));
  const qualityAlreadyRecorded = trustedManualEvidence.some((evidence) =>
    evidence.basis === MANUAL_DEDUCTION_BASIS.QUALITY_REPEATED_PATTERN);
  const hasEligibleLegacyEvidence = employee.delivery_tasks.some((task) =>
    isLegacyDeliveryDelayEvidenceForMonth(task, month)
    && !usedLegacyTaskIds.has(task.task_id));
  const hasEligibleQualityEvidence = QUALITY_DEDUCTION_APPROVAL_ENABLED
    && candidate?.quality.eligible === true
    && !qualityAlreadyRecorded;
  const manualLedgerBlocked = employee.integrity_blockers.some(
    isManualDeductionLedgerBlocker,
  );
  const canApproveManual = Boolean(
    month === currentMonth
    && capLedger
    && currency
    && !manualLedgerBlocked
    && capLedger.remaining_amount > 0
    && (
      hasEligibleLegacyEvidence
      || (hasEligibleQualityEvidence && employee.integrity_blockers.length === 0)
    ),
  );
  const canApproveComputed = Boolean(
    month === currentMonth
    && candidate
    && candidate.cap.approved_amount > 0
    && employee.integrity_blockers.length === 0
    && !validExistingCase,
  );

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{employee.display_name}</h2>
            <p className="text-xs text-muted-foreground">@{employee.username}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {employee.salary !== null && currency && (
              <Badge variant="outline">
                {t('salary', { amount: formatCurrency(employee.salary, currency) })}
              </Badge>
            )}
            {candidate && candidate.attendance.incidents.length > 0 && (
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/attendance">
                  <CalendarCheck className="me-2 h-4 w-4" />
                  {t('excuseAttendance')}
                </Link>
              </Button>
            )}
            <Button
              size="sm"
              onClick={onApproveComputed}
              disabled={!canApproveComputed || computedApproving}
              className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              <CheckCircle2 className="me-2 h-4 w-4" />
              {computedApproving ? t('computedApproving') : t('computedAction')}
            </Button>
            <Button
              size="sm"
              onClick={onManualDeduction}
              disabled={!canApproveManual}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              <Banknote className="me-2 h-4 w-4" />
              {t('manualAction')}
            </Button>
          </div>
        </div>

        {candidate && currency && employee.integrity_blockers.length === 0 ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/25">
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {activeExistingCase ? t('computedReview') : t('atRisk')}
                </p>
                <p className="text-lg font-bold text-amber-950 dark:text-amber-100">
                  {activeExistingCase
                    ? t('alreadyFinalized')
                    : formatCurrency(candidate.cap.approved_amount, currency)}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{t('attendance')}</p>
                <p className="font-semibold">{formatCurrency(candidate.attendance.amount, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {t('attendanceUnits', { units: candidate.attendance.total_units })}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{t('delivery')}</p>
                <p className="font-semibold">{formatCurrency(candidate.delivery.amount, currency)}</p>
                <p className="text-xs text-muted-foreground">
                  {candidate.delivery.on_time_pct === null
                    ? t('deliveryNoEvidence')
                    : t(`deliveryBands.${candidate.delivery.band}`, {
                        value: candidate.delivery.on_time_pct,
                      })}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{t('quality')}</p>
                <p className="font-semibold">{formatCurrency(0, currency)}</p>
                <p className="text-xs text-muted-foreground">
                   {t(candidate.quality.eligible
                     ? QUALITY_DEDUCTION_APPROVAL_ENABLED
                       ? 'qualityEligible'
                       : 'qualityTimingPending'
                     : 'qualityWarningOnly', {
                     count: candidate.quality.consecutive_months,
                   })}
                </p>
              </div>
            </div>

            {capLedger && (
            <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs sm:grid-cols-3">
              <span>{t('capTotal', {
                amount: formatCurrency(capLedger.cap_amount, currency),
                percent: MONTHLY_DEDUCTION_CAP_PERCENT,
              })}</span>
              <span>{t('capUsed', { amount: formatCurrency(capLedger.used_amount, currency) })}</span>
              <span className="font-medium">
                {t('capRemaining', { amount: formatCurrency(capLedger.remaining_amount, currency) })}
              </span>
            </div>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {t('projectionNotice')}
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/25">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-100">
              <AlertTriangle className="h-4 w-4" />{tIntegrity('title')}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
              {employee.integrity_blockers.map((blocker, index) => (
                <li key={`${blocker.code}-${index}`}>{tIntegrity(`codes.${integrityKey(blocker.code)}`)}</li>
              ))}
            </ul>
            {attendanceTrackingUnverified && onAttendanceTracking && month === currentMonth && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3 border-amber-300 bg-background dark:border-amber-800 dark:bg-amber-950/40"
                onClick={onAttendanceTracking}
              >
                <CalendarCheck className="me-2 h-4 w-4" />
                {t('attendanceTrackingAction')}
              </Button>
            )}
            {unlinkedManualDeductions.length > 0 && (
              <div className="mt-3 border-t border-amber-200 pt-2 dark:border-amber-900/60">
                <p className="text-xs font-medium">{t('unlinkedEvidence')}</p>
                {unlinkedManualDeductions.map(({ manual }) => (
                  <div key={manual.id} className="mt-1 text-xs text-muted-foreground">
                    <p className="break-words">{manual.reason}</p>
                    <ManualDeductionEvidenceSnapshot evidence={manual.evidence} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {(activeExistingCase || activeManualDeductions.length > 0) && (
          <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900/60 dark:bg-red-950/20">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-red-700 dark:text-red-300" />
              {t('finalizedTitle')}
            </h3>
            {activeExistingCase && (
              <div className="flex items-center justify-between gap-3 text-xs">
                <span>{t('systemFinalized')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                  {formatCurrency(
                    Number(activeExistingCase.case.approved_amount),
                    activeExistingCase.case.salary_currency,
                  )}
                  </span>
                  {activeExistingCase.payment.status === EMPLOYEE_PAYMENT_STATUS.APPROVED && onCancelDeduction && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onCancelDeduction(activeExistingCase.payment.id)}
                    >
                      <Undo2 className="me-2 h-4 w-4" />
                      {t('cancelAction')}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {activeManualDeductions.map(({ manual, payment }) => (
              <div key={manual.id} className="text-xs">
                <div className="flex items-start justify-between gap-3">
                  <span className="break-words">{manual.reason}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold">
                      {formatCurrency(Number(manual.approved_amount), manual.salary_currency)}
                    </span>
                    {payment?.status === EMPLOYEE_PAYMENT_STATUS.APPROVED && onCancelDeduction && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onCancelDeduction(payment.id)}
                      >
                        <Undo2 className="me-2 h-4 w-4" />
                        {t('cancelAction')}
                      </Button>
                    )}
                  </div>
                </div>
                <ManualDeductionEvidenceSnapshot evidence={manual.evidence} />
              </div>
            ))}
          </div>
        )}

        {(cancelledExistingCase || cancelledManualDeductions.length > 0) && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/30">
            <h3 className="text-sm font-semibold">{t('cancelledTitle')}</h3>
            {cancelledExistingCase && (
              <div className="flex items-start justify-between gap-3 text-xs">
                <div>
                  <p>{t('systemFinalized')}</p>
                  <p className="break-words text-muted-foreground">
                    {cancelledExistingCase.payment.cancellation_reason}
                  </p>
                </div>
                <span className="shrink-0 font-semibold line-through">
                  {formatCurrency(
                    Number(cancelledExistingCase.case.approved_amount),
                    cancelledExistingCase.case.salary_currency,
                  )}
                </span>
              </div>
            )}
            {cancelledManualDeductions.map(({ manual, payment }) => (
              <div key={manual.id} className="flex items-start justify-between gap-3 text-xs">
                <div>
                  <p className="break-words">{manual.reason}</p>
                  <p className="break-words text-muted-foreground">
                    {payment?.cancellation_reason}
                  </p>
                </div>
                <span className="shrink-0 font-semibold line-through">
                  {formatCurrency(Number(manual.approved_amount), manual.salary_currency)}
                </span>
              </div>
            ))}
          </div>
        )}

        <details className="rounded-xl border border-border/60">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            {t('viewEvidence')}
          </summary>
          <div className="space-y-3 border-t border-border/60 p-3">
            <DeductionRiskEvidence employee={employee} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
