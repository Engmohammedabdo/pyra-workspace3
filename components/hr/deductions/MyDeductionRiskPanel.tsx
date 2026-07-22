'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileWarning,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DeductionRiskEvidence } from '@/components/hr/deductions/DeductionRiskEvidence';
import { ManualDeductionEvidenceSnapshot } from '@/components/hr/deductions/ManualDeductionEvidenceSnapshot';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMyDeductionRisk } from '@/hooks/useDeductions';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';
import type { DeductionIntegrityBlocker } from '@/lib/hr/deductions-report';

function integrityKey(code: DeductionIntegrityBlocker['code']) {
  switch (code) {
    case 'invalid_salary': return 'integrity.codes.invalidSalary' as const;
    case 'invalid_salary_currency': return 'integrity.codes.invalidSalaryCurrency' as const;
    case 'historical_salary_unverified': return 'integrity.codes.historicalSalaryUnverified' as const;
    case 'inactive_employee': return 'integrity.codes.inactiveEmployee' as const;
    case 'attendance_tracking_unverified': return 'integrity.codes.attendanceTrackingUnverified' as const;
    case 'missing_productivity_evidence': return 'integrity.codes.missingProductivityEvidence' as const;
    case 'deduction_missing_effective_month': return 'integrity.codes.missingEffectiveMonth' as const;
    case 'deduction_cap_exemption_invalid': return 'integrity.codes.capExemptionInvalid' as const;
    case 'deduction_currency_mismatch': return 'integrity.codes.currencyMismatch' as const;
    case 'deduction_case_payment_missing': return 'integrity.codes.casePaymentMissing' as const;
    case 'deduction_case_payment_mismatch': return 'integrity.codes.casePaymentMismatch' as const;
    case 'manual_deduction_payment_missing': return 'integrity.codes.manualPaymentMissing' as const;
    case 'manual_deduction_payment_mismatch': return 'integrity.codes.manualPaymentMismatch' as const;
    case 'candidate_calculation_failed': return 'integrity.codes.calculationFailed' as const;
  }
}

function hasCasePaymentBlocker(blockers: readonly DeductionIntegrityBlocker[]): boolean {
  return blockers.some(({ code }) => (
    code === 'deduction_case_payment_missing'
    || code === 'deduction_case_payment_mismatch'
  ));
}

function hasManualPaymentBlocker(
  blockers: readonly DeductionIntegrityBlocker[],
  paymentId: string,
): boolean {
  return blockers.some((blocker) => (
    (
      blocker.code === 'manual_deduction_payment_missing'
      || blocker.code === 'manual_deduction_payment_mismatch'
    )
    && blocker.payment_id === paymentId
  ));
}

function RiskSkeleton() {
  return (
    <Card className="border-amber-200 dark:border-amber-900/60">
      <CardContent className="space-y-4 p-5">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-10 w-36" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-20" />)}
        </div>
      </CardContent>
    </Card>
  );
}

export function MyDeductionRiskPanel() {
  const t = useTranslations('hr.deductions.myRisk');
  const locale = useLocale() as Locale;
  const paymentStatusLabel = useStatusLabels('employeePayment');
  const currentUser = useCurrentUser();
  const isEmployee = currentUser.data?.role === 'employee';
  const risk = useMyDeductionRisk({ enabled: isEmployee });

  if (!isEmployee) return null;
  if (risk.isLoading) return <RiskSkeleton />;
  if (risk.isError || !risk.data) {
    return (
      <Card role="alert" className="border-red-200 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <FileWarning className="h-4 w-4 shrink-0" />
            <span className="text-sm font-medium">{t('error.title')}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => risk.refetch()}>
            {t('error.retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { employee, month } = risk.data;
  const { candidate, integrity_blockers: blockers } = employee;
  const currency = employee.currency ?? candidate?.currency ?? null;

  const finalized = employee.existing_case;
  const finalizedPaymentVerified = Boolean(
    finalized?.payment && !hasCasePaymentBlocker(blockers),
  );
  return (
    <section className="space-y-4" aria-label={t('title')}>
      {candidate && currency && blockers.length === 0 ? (
        <Card className="overflow-hidden border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/25">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <h2 className="font-semibold text-amber-950 dark:text-amber-100">{t('title')}</h2>
                <p className="text-xs text-amber-800 dark:text-amber-200">{t('month', { month })}</p>
              </div>
            </div>
            <div className="text-end">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('atRisk')}</p>
              <p data-testid="deduction-risk-total" className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                {formatCurrency(candidate.cap.approved_amount, currency)}
              </p>
            </div>
          </div>
          <p className="rounded-lg border border-amber-200 bg-white/60 p-2.5 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
            {t('projectionNotice')}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div data-testid="deduction-risk-attendance" className="rounded-xl border border-amber-200 bg-white/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <Clock3 className="mb-1 h-4 w-4 text-amber-700 dark:text-amber-300" />
              <p className="text-xs text-muted-foreground">{t('breakdown.attendance')}</p>
              <p className="font-semibold">{formatCurrency(candidate.attendance.amount, currency)}</p>
            </div>
            <div data-testid="deduction-risk-delivery" className="rounded-xl border border-orange-200 bg-white/70 p-3 dark:border-orange-900/60 dark:bg-orange-950/20">
              <Truck className="mb-1 h-4 w-4 text-orange-700 dark:text-orange-300" />
              <p className="text-xs text-muted-foreground">{t('breakdown.delivery')}</p>
              <p className="font-semibold">{formatCurrency(candidate.delivery.amount, currency)}</p>
            </div>
            <div data-testid="deduction-risk-quality" className="rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
              <ShieldAlert className="mb-1 h-4 w-4 text-slate-700 dark:text-slate-300" />
              <p className="text-xs text-muted-foreground">{t('breakdown.quality')}</p>
              <p className="font-semibold">{formatCurrency(0, currency)}</p>
            </div>
          </div>
        </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/25">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <h2 className="font-semibold text-amber-900 dark:text-amber-100">{t('integrity.title')}</h2>
                <p className="text-xs text-amber-800 dark:text-amber-200">{t('integrity.description')}</p>
              </div>
            </div>
            {blockers.length > 0 && (
              <ul className="space-y-1 ps-8 text-xs text-amber-800 dark:text-amber-200">
                {blockers.map((blocker, index) => (
                  <li key={`${blocker.code}-${index}`} className="flex gap-1">
                    <span aria-hidden="true">•</span>
                    <span>{t(integrityKey(blocker.code))}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <DeductionRiskEvidence employee={employee} />

      {finalized && finalizedPaymentVerified && (
        <Card data-testid="deduction-risk-finalized" className="border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-red-700 dark:text-red-300" />
              <div>
                <h3 className="text-sm font-semibold">{t('finalized.title')}</h3>
                <p className="text-xs text-muted-foreground">
                  {finalized.case.approved_at && formatDate(finalized.case.approved_at, 'dd MMM yyyy', locale)}
                  {finalized.payment?.status && ` · ${paymentStatusLabel(finalized.payment.status)}`}
                </p>
              </div>
            </div>
            <p className="font-semibold text-red-700 dark:text-red-300">
              {formatCurrency(Number(finalized.case.approved_amount), finalized.case.salary_currency)}
            </p>
          </CardContent>
        </Card>
      )}

      {finalized && !finalizedPaymentVerified && (
        <Card
          data-testid="deduction-risk-case-evidence"
          className="border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <CardContent className="flex items-start gap-2 p-4">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
            <div>
              <h3 className="text-sm font-semibold">{t('finalized.evidenceTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('finalized.evidenceDescription')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {employee.manual_deductions.map(({ manual, payment }) => {
        const paymentVerified = Boolean(
          payment && !hasManualPaymentBlocker(blockers, manual.payment_id),
        );
        return paymentVerified ? (
          <Card
            key={manual.id}
            data-testid={`deduction-risk-manual-${manual.id}`}
            className="border-red-200 bg-red-50/50 dark:border-red-900/60 dark:bg-red-950/20"
          >
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex min-w-0 items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{t('manualFinalized.title')}</h3>
                  <p className="break-words text-xs text-muted-foreground">{manual.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(manual.approved_at, 'dd MMM yyyy', locale)}
                    {payment?.status && ` · ${paymentStatusLabel(payment.status)}`}
                  </p>
                  <ManualDeductionEvidenceSnapshot evidence={manual.evidence} />
                </div>
              </div>
              <p className="font-semibold text-red-700 dark:text-red-300">
                {formatCurrency(Number(manual.approved_amount), manual.salary_currency)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card
            key={manual.id}
            data-testid={`deduction-risk-manual-evidence-${manual.id}`}
            className="border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20"
          >
            <CardContent className="flex min-w-0 items-start gap-2 p-4">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{t('manualFinalized.evidenceTitle')}</h3>
                <p className="break-words text-xs text-muted-foreground">{manual.reason}</p>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  {t('manualFinalized.evidenceDescription')}
                </p>
                <ManualDeductionEvidenceSnapshot evidence={manual.evidence} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
